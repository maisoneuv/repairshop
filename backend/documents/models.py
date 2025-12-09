from django.conf import settings
from django.db import models
from django.db.models import Q

from tenants.models import Tenant
from tasks.models import WorkItem


class FormTemplate(models.Model):
    """
    Generic template for generating PDFs (intake forms, invoices, quotes, etc.)
    Each tenant can have one active template per form type.
    """

    # Form type choices - extensible for future form types
    FORM_TYPE_INTAKE = 'intake'
    FORM_TYPE_INVOICE = 'invoice'
    FORM_TYPE_QUOTE = 'quote'
    FORM_TYPE_RECEIPT = 'receipt'
    FORM_TYPE_WORK_ORDER = 'work_order'
    FORM_TYPE_WARRANTY = 'warranty'

    FORM_TYPES = [
        (FORM_TYPE_INTAKE, 'Intake Form'),
        (FORM_TYPE_INVOICE, 'Invoice'),
        (FORM_TYPE_QUOTE, 'Quote'),
        (FORM_TYPE_RECEIPT, 'Receipt'),
        (FORM_TYPE_WORK_ORDER, 'Work Order'),
        (FORM_TYPE_WARRANTY, 'Warranty'),
    ]

    tenant = models.ForeignKey(
        Tenant,
        on_delete=models.CASCADE,
        related_name='form_templates'
    )
    form_type = models.CharField(
        max_length=50,
        choices=FORM_TYPES,
        default=FORM_TYPE_INTAKE,
        db_index=True
    )
    name = models.CharField(
        max_length=200,
        help_text="Template name (e.g., 'Default Intake Form', 'Premium Invoice')"
    )
    html_content = models.TextField(
        help_text="HTML template with {{variable}} placeholders"
    )
    is_active = models.BooleanField(
        default=False,
        help_text="Only one template per form type can be active per tenant"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='created_templates'
    )

    class Meta:
        constraints = [
            # Only one active template per tenant per form type
            models.UniqueConstraint(
                fields=['tenant', 'form_type'],
                condition=Q(is_active=True),
                name='unique_active_form_per_type'
            )
        ]
        ordering = ['-is_active', '-updated_at']
        verbose_name = 'Form Template'
        verbose_name_plural = 'Form Templates'
        permissions = [
            ('manage_templates', 'Can create, edit, and delete form templates'),
        ]

    def __str__(self):
        active_label = " (Active)" if self.is_active else ""
        return f"{self.get_form_type_display()} - {self.name}{active_label}"

    def save(self, *args, **kwargs):
        """Deactivate other templates of same type when activating this one"""
        if self.is_active:
            # Deactivate all other templates of the same type for this tenant
            FormTemplate.objects.filter(
                tenant=self.tenant,
                form_type=self.form_type,
                is_active=True
            ).exclude(pk=self.pk).update(is_active=False)
        super().save(*args, **kwargs)


class FormDocument(models.Model):
    """
    Generated PDF document from a template.
    Tracks all form documents created for work items.
    """

    STATUS_SUCCESS = 'success'
    STATUS_ERROR = 'error'
    STATUS_PENDING = 'pending'

    STATUS_CHOICES = [
        (STATUS_SUCCESS, 'Success'),
        (STATUS_ERROR, 'Error'),
        (STATUS_PENDING, 'Pending'),
    ]

    tenant = models.ForeignKey(
        Tenant,
        on_delete=models.CASCADE,
        related_name='form_documents'
    )
    form_type = models.CharField(
        max_length=50,
        db_index=True,
        help_text="Denormalized for quick filtering"
    )
    template = models.ForeignKey(
        FormTemplate,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='generated_documents',
        help_text="Template used to generate this document (nullable if template deleted)"
    )
    work_item = models.ForeignKey(
        WorkItem,
        on_delete=models.CASCADE,
        related_name='form_documents'
    )

    file_path = models.CharField(
        max_length=500,
        help_text="Relative path to the generated PDF file"
    )
    generated_at = models.DateTimeField(auto_now_add=True)
    generated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='generated_documents',
        help_text="User who generated the document. Null = auto-generated"
    )
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default=STATUS_PENDING,
        db_index=True
    )
    error_message = models.TextField(
        blank=True,
        null=True,
        help_text="Error details if generation failed"
    )

    class Meta:
        ordering = ['-generated_at']
        verbose_name = 'Form Document'
        verbose_name_plural = 'Form Documents'
        indexes = [
            models.Index(fields=['work_item', 'form_type']),
            models.Index(fields=['tenant', 'form_type', 'status']),
        ]

    def __str__(self):
        status_icon = {
            self.STATUS_SUCCESS: '✓',
            self.STATUS_ERROR: '✗',
            self.STATUS_PENDING: '⏳'
        }.get(self.status, '')

        return f"{status_icon} {self.work_item.reference_id} - {self.form_type} ({self.generated_at.strftime('%Y-%m-%d %H:%M')})"

    @property
    def is_auto_generated(self):
        """Check if document was auto-generated (vs manually triggered)"""
        return self.generated_by is None
