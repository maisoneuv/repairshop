from django.utils import timezone
from datetime import timedelta
from django.db import transaction
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.authentication import SessionAuthentication
from drf_spectacular.utils import extend_schema, inline_serializer
from rest_framework import serializers as drf_serializers

import phonenumbers
from phonenumbers import NumberParseException

from core.authentication import APIKeyAuthentication
from .models import Call
from .serializers import CallSerializer
from customers.models import Customer, Lead


@extend_schema(
    request=inline_serializer(
        name='IncomingCallRequest',
        fields={'phone_number': drf_serializers.CharField(help_text='Numer telefonu w formacie E.164, np. +48123456789')}
    ),
    responses={201: CallSerializer},
)
@api_view(['POST'])
@authentication_classes([SessionAuthentication, APIKeyAuthentication])
@permission_classes([IsAuthenticated])
def incoming_call(request):
    """Used by Android app to register incoming calls."""
    phone = request.data.get('phone_number', '').strip()
    if not phone:
        return Response({'detail': 'phone_number wymagany.'}, status=400)
    tenant = request.tenant

    # Parse phone number to separate prefix and national number
    try:
        parsed = phonenumbers.parse(phone, None)
        lead_prefix = f"+{parsed.country_code}"
        lead_phone = str(parsed.national_number)
    except NumberParseException:
        lead_prefix = None
        lead_phone = phone

    with transaction.atomic():
        customer = Customer.objects.filter(tenant=tenant, full_phone_number=phone).first()
        lead = None
        if not customer:
            lead = Lead.objects.filter(tenant=tenant, full_phone_number=phone).first()
            if not lead:
                lead = Lead.objects.create(
                    tenant=tenant,
                    prefix=lead_prefix,
                    phone_number=lead_phone,
                    first_name='',
                    status='new',
                )
        call = Call.objects.create(
            tenant=tenant,
            phone_number=phone,
            customer=customer,
            lead=lead,
        )
    return Response(CallSerializer(call).data, status=201)


@api_view(['GET'])
@authentication_classes([SessionAuthentication, APIKeyAuthentication])
@permission_classes([IsAuthenticated])
def pending_calls(request):
    """Car Mode polling - returns unhandled calls from the last 5 minutes."""
    tenant = request.tenant
    cutoff = timezone.now() - timedelta(minutes=5)
    calls = Call.objects.filter(
        tenant=tenant,
        handled_at__isnull=True,
        created_at__gte=cutoff
    ).select_related('customer', 'lead')
    return Response(CallSerializer(calls, many=True).data)


@api_view(['POST'])
@authentication_classes([SessionAuthentication, APIKeyAuthentication])
@permission_classes([IsAuthenticated])
def mark_handled(request, pk):
    """Car Mode - marks a call as handled and propagates notes to linked lead."""
    try:
        call = Call.objects.select_related('lead').get(pk=pk, tenant=request.tenant)
    except Call.DoesNotExist:
        return Response(status=404)

    call.handled_at = timezone.now()
    notes_text = request.data.get('notes', '').strip()
    if 'notes' in request.data:
        call.notes = request.data['notes']
    call.save(update_fields=['handled_at', 'notes'])

    if call.lead and notes_text:
        lead = call.lead
        new_note = f"[{timezone.now().strftime('%Y-%m-%d')}] {notes_text}"
        if lead.notes:
            lead.notes = f"{lead.notes}\n{new_note}"
        else:
            lead.notes = new_note
        lead.save(update_fields=['notes'])

    return Response(CallSerializer(call).data)
