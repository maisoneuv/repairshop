"""
API views for integration callbacks.
"""
import logging
import uuid
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from django.utils import timezone
from django.shortcuts import get_object_or_404

from tasks.models import WorkItem
from .models import CustomAction
from core.models import UserRole

logger = logging.getLogger(__name__)


class SummaryCallbackView(APIView):
    """
    Callback endpoint for n8n to POST AI-generated summaries.

    POST /api/integrations/summary-callback/

    Headers:
        Authorization: Bearer <api_key>

    Body:
        {
            "request_id": "uuid-from-request",
            "workitem_id": 123,
            "summary": "AI-generated summary text...",
            "status": "success" | "error",
            "error_message": "optional error message"
        }
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        request_id = request.data.get('request_id')
        workitem_id = request.data.get('workitem_id')
        summary = request.data.get('summary')
        callback_status = request.data.get('status', 'success')
        error_message = request.data.get('error_message')

        # Validate required fields
        if not request_id or not workitem_id:
            return Response(
                {'error': 'request_id and workitem_id are required'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            request_uuid = uuid.UUID(str(request_id))
        except ValueError:
            return Response(
                {'error': 'Invalid request_id format'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Find the work item
        workitem = get_object_or_404(WorkItem, pk=workitem_id)

        # Verify request_id matches (security check)
        if workitem.summary_request_id != request_uuid:
            logger.warning(
                f"Summary callback request_id mismatch for WorkItem {workitem_id}. "
                f"Expected {workitem.summary_request_id}, got {request_uuid}"
            )
            return Response(
                {'error': 'Invalid request_id'},
                status=status.HTTP_403_FORBIDDEN
            )

        # Verify tenant matches (API key tenant = work item tenant)
        if hasattr(request, 'tenant') and request.tenant and request.tenant != workitem.tenant:
            logger.warning(
                f"Summary callback tenant mismatch for WorkItem {workitem_id}. "
                f"API key tenant: {request.tenant}, WorkItem tenant: {workitem.tenant}"
            )
            return Response(
                {'error': 'Tenant mismatch'},
                status=status.HTTP_403_FORBIDDEN
            )

        # Update work item based on callback status
        if callback_status == 'success' and summary:
            workitem.summary = summary
            workitem.summary_status = 'completed'
            workitem.summary_generated_at = timezone.now()
            workitem.save(update_fields=[
                'summary', 'summary_status', 'summary_generated_at'
            ])

            logger.info(f"Summary saved for WorkItem {workitem.reference_id}")

            return Response({
                'message': 'Summary saved successfully',
                'workitem_reference': workitem.reference_id
            })

        else:
            # Handle failure
            workitem.summary_status = 'failed'
            workitem.save(update_fields=['summary_status'])

            logger.error(
                f"Summary generation failed for WorkItem {workitem.reference_id}: "
                f"{error_message}"
            )

            return Response({
                'message': 'Summary generation failure recorded',
                'error': error_message
            })


class CustomActionListView(APIView):
    """
    List active custom actions visible to the current user for a given target.

    GET /api/integrations/custom-actions/?target=workitem
    GET /api/integrations/custom-actions/?target=task
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        target = request.query_params.get('target')
        if target not in ('workitem', 'task', 'global'):
            return Response(
                {'error': 'target must be "workitem" or "task"'},
                status=status.HTTP_400_BAD_REQUEST
            )

        actions = CustomAction.objects.filter(
            tenant=request.tenant,
            target=target,
            is_active=True,
        )

        # Filter by role: skip actions whose required_role the user doesn't have
        visible = []
        for action in actions:
            if action.required_role is None:
                visible.append(action)
            elif UserRole.objects.filter(user=request.user, role=action.required_role).exists():
                visible.append(action)

        data = [
            {
                'id': a.id,
                'name': a.name,
                'show_text_input': a.show_text_input,
                'text_input_label': a.text_input_label,
            }
            for a in visible
        ]
        return Response(data)


class CustomActionExecuteView(APIView):
    """
    Execute a custom action for a specific record.

    POST /api/integrations/custom-actions/<pk>/execute/
    Body: {"target_id": 42, "user_input": "optional text"}
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        action = get_object_or_404(CustomAction, pk=pk, tenant=request.tenant, is_active=True)

        # Re-check role gate
        if action.required_role is not None:
            if not UserRole.objects.filter(user=request.user, role=action.required_role).exists():
                return Response(
                    {'error': 'Permission denied'},
                    status=status.HTTP_403_FORBIDDEN
                )

        user_input = request.data.get('user_input', '')

        if action.target == 'global':
            target_id = None
        else:
            target_id = request.data.get('target_id')
            if not target_id:
                return Response(
                    {'error': 'target_id is required'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            target_id = int(target_id)

        from integrations.tasks import execute_custom_action
        execute_custom_action.delay(action.id, target_id, user_input)

        return Response({'status': 'queued'}, status=status.HTTP_202_ACCEPTED)
