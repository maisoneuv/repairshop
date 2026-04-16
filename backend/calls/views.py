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
from .serializers import CallSerializer, CallUpdateSerializer, CompleteAfterCallSerializer
from customers.models import Customer, Lead
from tasks.models import Task
from service.models import Employee


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
        call.notes = _append_note_text(call.notes, request.data['notes'])
    call.save(update_fields=['handled_at', 'notes'])

    if call.lead and notes_text:
        call.lead.notes = _append_note_text(call.lead.notes, notes_text)
        call.lead.save(update_fields=['notes'])

    return Response(CallSerializer(call).data)


LEAD_CREATING_STATUSES = {'Success', 'Callback'}
LEAD_STATUS_MAP = {
    'Success': 'converted',
    'Callback': 'callback',
}


def _today_str():
    return timezone.now().strftime('%Y-%m-%d')


def _format_note_line(note):
    return f"[{_today_str()}] {note.strip()}"


def _append_note_text(existing_text, note):
    note = (note or '').strip()
    if not note:
        return existing_text

    new_line = _format_note_line(note)
    if existing_text:
        return f"{existing_text}\n{new_line}"
    return new_line


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
            call.notes = _append_note_text(call.notes, note)

        if status_value:
            call.status = status_value
            call.handled_at = timezone.now()
            _handle_lead_for_call(call, status_value, note, request.tenant)

        call.save()

    return Response(CallSerializer(call).data)


@api_view(['POST'])
@authentication_classes([SessionAuthentication, APIKeyAuthentication])
@permission_classes([IsAuthenticated])
def complete_after_call(request, pk):
    serializer = CompleteAfterCallSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data

    with transaction.atomic():
        try:
            call = Call.objects.select_related('customer', 'lead').select_for_update().get(
                pk=pk, tenant=request.tenant
            )
        except Call.DoesNotExist:
            return Response(status=404)

        status_value = data['status']
        note = data.get('note', '')
        lead_first_name = data.get('lead_first_name', '').strip()
        lead_last_name = data.get('lead_last_name', '').strip()
        follow_up_task_summary = data.get('follow_up_task_summary', '').strip()
        follow_up_task_due_date = data.get('follow_up_task_due_date')

        if note:
            call.notes = _append_note_text(call.notes, note)
        call.status = status_value
        call.handled_at = timezone.now()

        lead = _complete_after_call_lead(
            call=call,
            tenant=request.tenant,
            status_value=status_value,
            note=note,
            lead_first_name=lead_first_name,
            lead_last_name=lead_last_name,
        )

        task = None
        if follow_up_task_summary:
            task = _create_follow_up_task(
                request=request,
                tenant=request.tenant,
                summary=follow_up_task_summary,
                due_date=follow_up_task_due_date,
                call=call,
            )

        call.save()

    return Response({
        'call': CallSerializer(call).data,
        'lead': _serialize_lead(lead),
        'task': _serialize_task(task),
    })


def _handle_lead_for_call(call, status_value, note, tenant):
    """Create or update Lead based on call outcome. Must be called inside atomic block."""
    if call.lead and note:
        call.lead.notes = _append_note_text(call.lead.notes, note)
        call.lead.save(update_fields=['notes'])

    if status_value not in LEAD_CREATING_STATUSES:
        return

    lead_status = LEAD_STATUS_MAP[status_value]

    if call.customer:
        return  # Returning customer — no Lead needed

    if call.lead:
        # Update existing lead
        call.lead.status = lead_status
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
    if call.notes:
        lead.notes = call.notes
        lead.save(update_fields=['notes'])

    call.lead = lead


def _complete_after_call_lead(
    call,
    tenant,
    status_value,
    note,
    lead_first_name='',
    lead_last_name='',
):
    should_create_or_update = (
        status_value in LEAD_CREATING_STATUSES
        or bool(lead_first_name)
        or bool(lead_last_name)
        or call.lead_id is not None
    )

    if call.customer:
        return None

    if not should_create_or_update:
        return call.lead

    lead = call.lead
    if lead is None:
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
            first_name=lead_first_name,
            last_name=lead_last_name,
            status=LEAD_STATUS_MAP.get(status_value, 'new'),
        )
        call.lead = lead
    else:
        updated_fields = []
        if lead_first_name and lead.first_name != lead_first_name:
            lead.first_name = lead_first_name
            updated_fields.append('first_name')
        if lead_last_name and lead.last_name != lead_last_name:
            lead.last_name = lead_last_name
            updated_fields.append('last_name')
        if status_value in LEAD_STATUS_MAP and lead.status != LEAD_STATUS_MAP[status_value]:
            lead.status = LEAD_STATUS_MAP[status_value]
            updated_fields.append('status')
        if updated_fields:
            lead.save(update_fields=updated_fields)

    if note:
        lead.notes = _append_note_text(lead.notes, note)
        lead.save(update_fields=['notes'])
    elif lead.pk and status_value in LEAD_STATUS_MAP and lead.status != LEAD_STATUS_MAP[status_value]:
        lead.status = LEAD_STATUS_MAP[status_value]
        lead.save(update_fields=['status'])

    return lead


def _create_follow_up_task(request, tenant, summary, due_date, call):
    employee = Employee.objects.filter(user=request.user, tenant=tenant).first()
    if not employee:
        raise drf_serializers.ValidationError({'follow_up_task_summary': 'Current user has no employee profile for this tenant.'})

    has_perm = getattr(request.user, 'is_superuser', False) or (
        hasattr(request.user, 'has_permission')
        and request.user.has_permission('tasks.add_task', tenant)
    )
    if not has_perm:
        raise drf_serializers.ValidationError({'follow_up_task_summary': 'Current user cannot create tasks.'})

    description = f"Call {call.id} follow-up for {call.phone_number}"
    return Task.objects.create(
        tenant=tenant,
        summary=summary,
        description=description,
        assigned_employee=employee,
        due_date=due_date,
    )


def _serialize_lead(lead):
    if not lead:
        return None
    return {
        'id': lead.id,
        'first_name': lead.first_name,
        'last_name': lead.last_name or '',
        'status': lead.status,
    }


def _serialize_task(task):
    if not task:
        return None
    return {
        'id': task.id,
        'reference_id': task.reference_id,
        'summary': task.summary,
        'due_date': task.due_date.isoformat() if task.due_date else None,
    }
