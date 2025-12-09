"""
API views for form templates and documents.
"""
import logging
from datetime import datetime, timedelta
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, DjangoModelPermissions
from django.shortcuts import get_object_or_404
from django.http import FileResponse, Http404, HttpResponse
from django_filters.rest_framework import DjangoFilterBackend

from tasks.models import WorkItem
from .models import FormTemplate, FormDocument
from .serializers import (
    FormTemplateSerializer,
    FormTemplateListSerializer,
    FormDocumentSerializer,
    GenerateFormDocumentSerializer,
    AvailableVariablesSerializer,
)
from .tasks import generate_form_document_task
from .variables import replace_variables_in_html, format_date_polish, format_datetime_polish

logger = logging.getLogger(__name__)


def get_sample_template_data():
    """
    Returns sample data for template preview.
    Mimics real work item data structure with realistic Polish examples.
    """
    now = datetime.now()
    created_date = now - timedelta(days=2)
    due_date = now + timedelta(days=5)

    return {
        # Customer variables
        'customer.full_name': 'Jan Kowalski',
        'customer.first_name': 'Jan',
        'customer.last_name': 'Kowalski',
        'customer.phone': '+48 123 456 789',
        'customer.email': 'jan.kowalski@example.pl',
        'customer.address': 'ul. Zamieniecka 55, 04-158 Warszawa, Polska',
        'customer.address.street': 'ul. Zamieniecka 55',
        'customer.address.city': 'Warszawa',
        'customer.address.postal_code': '04-158',
        'customer.address.country': 'Polska',
        'customer.tax_code': '1234567890',

        # Work Item variables
        'workitem.reference_id': 'RMA-12345',
        'workitem.created_date': format_date_polish(created_date),
        'workitem.created_date_time': format_datetime_polish(created_date),
        'workitem.due_date': format_date_polish(due_date),
        'workitem.closed_date': '',
        'workitem.status': 'W trakcie diagnozy',
        'workitem.type': 'Naprawa',
        'workitem.priority': 'Wysoki',
        'workitem.description': 'Urządzenie nie włącza się, brak reakcji na przycisk power',
        'workitem.device_condition': 'Dobry stan wizualny, drobne zarysowania na obudowie',
        'workitem.accessories': 'Zasilacz oryginalny, kabel USB',
        'workitem.comments': 'Klient zgłasza problem po burzy',
        'workitem.prepaid_amount': '150.00',
        'workitem.estimated_price': '350.00',
        'workitem.final_price': '320.00',
        'workitem.repair_cost': '280.00',
        'workitem.payment_method': 'Przelew',
        'workitem.intake_method': 'Bezpośrednio w serwisie',
        'workitem.dropoff_method': 'Odbiór osobisty',

        # Asset variables
        'asset.device_name': 'Laptop Dell XPS 15',
        'asset.device_model': 'XPS 15 9520',
        'asset.device_manufacturer': 'Dell',
        'asset.serial_number': 'SN123456789ABC',

        # Staff - Owner variables
        'owner.full_name': 'Anna Nowak',
        'owner.first_name': 'Anna',
        'owner.last_name': 'Nowak',
        'owner.email': 'anna.nowak@fixed.pl',

        # Staff - Technician variables
        'technician.full_name': 'Piotr Wiśniewski',
        'technician.first_name': 'Piotr',
        'technician.last_name': 'Wiśniewski',
        'technician.email': 'piotr.wisniewski@fixed.pl',

        # Location variables
        'dropoff.name': 'FIXED Serwis Główny',
        'dropoff.address': 'ul. Zamieniecka 55, 04-158 Warszawa',
        'dropoff.type': 'Serwis stacjonarny',
        'pickup.name': 'FIXED Serwis Główny',
        'pickup.address': 'ul. Zamieniecka 55, 04-158 Warszawa',
        'pickup.type': 'Serwis stacjonarny',

        # Repair Shop variables
        'shop.name': 'FIXED sp. z o.o.',
        'shop.type': 'Serwis wewnętrzny',

        # Current date/time variables
        'today': format_date_polish(now),
        'current_date': format_date_polish(now),
        'current_datetime': format_datetime_polish(now),
        'current_time': now.strftime('%H:%M'),
    }


class FormTemplateViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing form templates.

    Provides CRUD operations for form templates with tenant filtering.
    Only users with 'manage_templates' permission can create/edit/delete.
    """

    queryset = FormTemplate.objects.all()
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['form_type', 'is_active']

    def get_queryset(self):
        """Filter templates by user's tenant"""
        user = self.request.user
        if hasattr(user, 'tenant') and user.tenant:
            return FormTemplate.objects.filter(tenant=user.tenant).order_by('-is_active', '-updated_at')
        return FormTemplate.objects.none()

    def get_serializer_class(self):
        """Use lightweight serializer for list action"""
        if self.action == 'list':
            return FormTemplateListSerializer
        return FormTemplateSerializer

    def perform_create(self, serializer):
        """Set tenant and created_by on template creation"""
        serializer.save(
            tenant=self.request.user.tenant,
            created_by=self.request.user
        )

    def check_permissions(self, request):
        """Check manage_templates permission for write operations"""
        super().check_permissions(request)

        # For write operations, require manage_templates permission
        if request.method in ['POST', 'PUT', 'PATCH', 'DELETE']:
            if not request.user.has_perm('documents.manage_templates'):
                self.permission_denied(
                    request,
                    message="You don't have permission to manage form templates"
                )

    @action(detail=True, methods=['post'])
    def activate(self, request, pk=None):
        """
        Activate a template (deactivates others of same type).

        POST /api/documents/templates/{id}/activate/
        """
        template = self.get_object()
        template.is_active = True
        template.save()  # save() method handles deactivating others

        serializer = self.get_serializer(template)
        return Response(serializer.data)

    @action(detail=True, methods=['post'])
    def deactivate(self, request, pk=None):
        """
        Deactivate a template.

        POST /api/documents/templates/{id}/deactivate/
        """
        template = self.get_object()
        template.is_active = False
        template.save()

        serializer = self.get_serializer(template)
        return Response(serializer.data)

    @action(detail=True, methods=['post'])
    def duplicate(self, request, pk=None):
        """
        Duplicate a template.

        POST /api/documents/templates/{id}/duplicate/
        Body: {"name": "New Template Name"} (optional)
        """
        template = self.get_object()

        # Create copy
        new_template = FormTemplate.objects.get(pk=template.pk)
        new_template.pk = None  # Create new instance
        new_template.is_active = False
        new_template.created_by = request.user

        # Set name from request or default
        new_name = request.data.get('name')
        if new_name:
            new_template.name = new_name
        else:
            new_template.name = f"{template.name} (Copy)"

        new_template.save()

        serializer = self.get_serializer(new_template)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=['get'])
    def available_variables(self, request):
        """
        Get list of all available template variables.

        GET /api/documents/templates/available_variables/
        """
        variables_list = AvailableVariablesSerializer.get_variables_list()
        serializer = AvailableVariablesSerializer(variables_list, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['post'])
    def preview(self, request, pk=None):
        """
        Preview a template with sample data.

        POST /api/documents/templates/{id}/preview/
        Body (optional): {"html_content": "<html>..."}

        Returns rendered HTML with sample data filled in.
        """
        template = self.get_object()

        # Get HTML content from request body or use template's content
        html_content = request.data.get('html_content', template.html_content)

        if not html_content:
            return Response(
                {'error': 'No HTML content provided'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            # Get sample data
            sample_data = get_sample_template_data()

            # Replace variables in HTML
            rendered_html = replace_variables_in_html(html_content, sample_data)

            # Return as HTML response
            return HttpResponse(rendered_html, content_type='text/html')

        except Exception as e:
            logger.error(f"Preview generation failed: {str(e)}")
            return Response(
                {'error': f'Preview generation failed: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    @action(detail=False, methods=['post'])
    def preview_anonymous(self, request):
        """
        Preview template HTML without saving (for unsaved templates).

        POST /api/documents/templates/preview/
        Body: {"html_content": "<html>..."}

        Returns rendered HTML with sample data filled in.
        Useful for previewing before creating a template.
        """
        html_content = request.data.get('html_content')

        if not html_content:
            return Response(
                {'error': 'html_content is required'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            # Get sample data
            sample_data = get_sample_template_data()

            # Replace variables in HTML
            rendered_html = replace_variables_in_html(html_content, sample_data)

            # Return as HTML response
            return HttpResponse(rendered_html, content_type='text/html')

        except Exception as e:
            logger.error(f"Anonymous preview generation failed: {str(e)}")
            return Response(
                {'error': f'Preview generation failed: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class FormDocumentViewSet(viewsets.ReadOnlyModelViewSet):
    """
    ViewSet for viewing form documents.

    Read-only API for generated form documents.
    Documents are created via auto-generation or manual trigger.
    """

    queryset = FormDocument.objects.all()
    serializer_class = FormDocumentSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['form_type', 'status', 'work_item']

    def get_queryset(self):
        """Filter documents by user's tenant"""
        user = self.request.user
        if hasattr(user, 'tenant') and user.tenant:
            return FormDocument.objects.filter(
                tenant=user.tenant
            ).select_related(
                'template',
                'work_item',
                'generated_by'
            ).order_by('-generated_at')
        return FormDocument.objects.none()

    @action(detail=True, methods=['get'])
    def download(self, request, pk=None):
        """
        Download a PDF document.

        GET /api/documents/{id}/download/
        """
        document = self.get_object()

        if document.status != FormDocument.STATUS_SUCCESS:
            return Response(
                {'error': 'Document generation failed or is pending'},
                status=status.HTTP_400_BAD_REQUEST
            )

        if not document.file_path:
            return Response(
                {'error': 'File path not found'},
                status=status.HTTP_404_NOT_FOUND
            )

        try:
            from django.conf import settings
            import os

            file_path = os.path.join(settings.MEDIA_ROOT, document.file_path)

            if not os.path.exists(file_path):
                raise Http404("PDF file not found on disk")

            # Return file as attachment
            response = FileResponse(
                open(file_path, 'rb'),
                content_type='application/pdf'
            )
            response['Content-Disposition'] = f'attachment; filename="{os.path.basename(file_path)}"'
            return response

        except Exception as e:
            logger.error(f"Failed to serve document {document.id}: {str(e)}")
            return Response(
                {'error': 'Failed to retrieve PDF file'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class WorkItemFormDocumentViewSet(viewsets.ViewSet):
    """
    ViewSet for work item-specific form document operations.

    Nested under work items: /api/work-items/{work_item_id}/documents/
    """

    permission_classes = [IsAuthenticated]

    def list(self, request, work_item_pk=None):
        """
        List all form documents for a work item.

        GET /api/work-items/{work_item_id}/documents/
        """
        work_item = self._get_work_item(request, work_item_pk)

        documents = FormDocument.objects.filter(
            work_item=work_item
        ).select_related('template', 'generated_by').order_by('-generated_at')

        # Filter by form_type if provided
        form_type = request.query_params.get('form_type')
        if form_type:
            documents = documents.filter(form_type=form_type)

        serializer = FormDocumentSerializer(documents, many=True, context={'request': request})
        return Response(serializer.data)

    def create(self, request, work_item_pk=None):
        """
        Manually generate a form document for a work item.

        POST /api/work-items/{work_item_id}/documents/
        Body: {"form_type": "intake", "template_id": 123 (optional)}
        """
        work_item = self._get_work_item(request, work_item_pk)

        # Validate request data
        serializer = GenerateFormDocumentSerializer(
            data=request.data,
            context={'request': request, 'work_item': work_item}
        )
        serializer.is_valid(raise_exception=True)

        form_type = serializer.validated_data['form_type']
        template_id = serializer.validated_data.get('template_id')

        # Queue generation task
        try:
            result = generate_form_document_task.delay(
                work_item_id=work_item.id,
                template_id=template_id,
                form_type=form_type,
                user_id=request.user.id
            )

            return Response({
                'message': 'Form document generation queued successfully',
                'task_id': result.id,
                'work_item': work_item.reference_id,
                'form_type': form_type,
            }, status=status.HTTP_202_ACCEPTED)

        except Exception as e:
            logger.error(f"Failed to queue form generation for work item {work_item_pk}: {str(e)}")
            return Response(
                {'error': 'Failed to queue form generation task'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    def _get_work_item(self, request, work_item_pk):
        """Get work item and verify tenant access"""
        work_item = get_object_or_404(WorkItem, pk=work_item_pk)

        # Verify user has access to this work item's tenant
        if hasattr(request.user, 'tenant') and work_item.tenant != request.user.tenant:
            raise Http404("Work item not found")

        return work_item
