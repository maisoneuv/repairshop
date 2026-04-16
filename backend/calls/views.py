import phonenumbers
from phonenumbers import NumberParseException

from django.db import transaction
from django.utils import timezone
from datetime import timedelta
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.authentication import SessionAuthentication
from drf_spectacular.utils import extend_schema, inline_serializer
from rest_framework import serializers as drf_serializers

from core.authentication import APIKeyAuthentication
from .models import Call
from .serializers import CallSerializer, CallUpdateSerializer
from customers.models import Customer, Lead


@api_view(['POST'])
@authentication_classes([SessionAuthentication, APIKeyAuthentication])
@permission_classes([IsAuthenticated])
def debug_incoming_call(request):
    """Debug endpoint - returns detailed info about incoming request.
    """

    return Response({
        'method': request.method,
        'path': request.path,
        'content_type': request.content_type,
        'headers': dict((k.replace('HTTP_', ''), v) for k, v in request.META.items() if k.startswith('HTTP_')),
        'body_raw': request.body.decode('utf-8', errors='replace'),
        'data': request.data,
        'user': str(request.user),
        'auth': str(request.auth),
        'tenant': str(getattr(request, 'tenant', None)),
    })


@extend_schema(
    request=inline_serializer(
        name='IncomingCallRequest',
        fields={
            'phone_number': drf_serializers.CharField(help_text='Numer telefonu, np. +48123456789'),
            'type': drf_serializers.ChoiceField(choices=['incoming', 'outbound'], default='incoming'),
        }
    ),
    responses={201: CallSerializer},
)
@api_view(['POST'])
@authentication_classes([SessionAuthentication, APIKeyAuthentication])
@permission_classes([IsAuthenticated])
def incoming_call(request):
    """Used by Android app to register incoming/outgoing calls."""
    phone = request.data.get('phone_number', '').strip()
    call_type = request.data.get('type', 'incoming')
    if call_type not in ('incoming', 'outbound'):
        call_type = 'incoming'
    if not phone:
        return Response({'detail': 'phone_number required.'}, status=400)
    tenant = request.tenant

    customer = Customer.objects.filter(tenant=tenant, full_phone_number=phone).first()
    lead = None
    if not customer:
        lead = Lead.objects.filter(tenant=tenant, full_phone_number=phone).first()

    call = Call.objects.create(
        tenant=tenant,
        phone_number=phone,
        type=call_type,
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


LEAD_CREATING_STATUSES = {'Success', 'Callback'}
LEAD_STATUS_MAP = {
    'Success': 'converted',
    'Callback': 'callback',
}


@api_view(['PATCH'])
@authentication_classes([SessionAuthentication, APIKeyAuthentication])
@permission_classes([IsAuthenticated])
def update_call(request, pk):
    """Android app: update call duration and/or post-call status."""
    serializer = CallUpdateSerializer(data=request.data, partial=True)
    if not serializer.is_valid():
        return Response(serializer.errors, status=400)

    data = serializer.validated_data
    duration = data.get('duration')
    status_value = data.get('status', '')
    note = data.get('note', '')

    with transaction.atomic():
        try:
            call = Call.objects.select_related('customer', 'lead').select_for_update().get(
                pk=pk, tenant=request.tenant
            )
        except Call.DoesNotExist:
            return Response(status=404)

        if duration is not None:
            call.duration = duration

        if note:
            call.notes = note

        if status_value:
            call.status = status_value
            call.handled_at = timezone.now()
            _handle_lead_for_call(call, status_value, note, request.tenant)

        call.save()

    return Response(CallSerializer(call).data)


def _handle_lead_for_call(call, status_value, note, tenant):
    """Create or update Lead based on call outcome. Must be called inside atomic block."""
    if status_value not in LEAD_CREATING_STATUSES:
        return

    lead_status = LEAD_STATUS_MAP[status_value]
    today = timezone.now().strftime('%Y-%m-%d')

    if call.customer:
        return  # Returning customer — no Lead needed

    if call.lead:
        # Update existing lead
        call.lead.status = lead_status
        if note:
            new_note_line = f"[{today}] {note}"
            if call.lead.notes:
                call.lead.notes = f"{call.lead.notes}\n{new_note_line}"
            else:
                call.lead.notes = new_note_line
        call.lead.save(update_fields=['status', 'notes'])
        return

    # Create new lead from unknown caller
    try:
        parsed = phonenumbers.parse(call.phone_number, None)
        prefix = f"+{parsed.country_code}"
        national = str(parsed.national_number)
    except NumberParseException:
        prefix = None
        national = call.phone_number

    lead = Lead.objects.create(
        tenant=tenant,
        prefix=prefix,
        phone_number=national,
        first_name='',
        status=lead_status,
    )
    if note:
        lead.notes = f"[{today}] {note}"
        lead.save(update_fields=['notes'])

    call.lead = lead
