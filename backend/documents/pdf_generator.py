"""
PDF generation service using Playwright headless browser.
Converts HTML templates to PDF files.
"""
import os
import logging
from pathlib import Path
from datetime import datetime
from django.conf import settings
from playwright.sync_api import sync_playwright

from .variables import get_template_variables, replace_variables_in_html

logger = logging.getLogger(__name__)


class PDFGenerationError(Exception):
    """Custom exception for PDF generation errors"""
    pass


def generate_pdf_from_work_item(work_item, template, output_filename=None):
    """
    Generate a PDF document from a work item using a template.

    Args:
        work_item: WorkItem instance (should have related data prefetched)
        template: FormTemplate instance
        output_filename: Optional custom filename (without extension)

    Returns:
        str: Relative path to the generated PDF file

    Raises:
        PDFGenerationError: If PDF generation fails
    """
    try:
        # Get template variables from work item
        variables = get_template_variables(work_item)

        # Replace variables in HTML template
        html_content = replace_variables_in_html(template.html_content, variables)

        # Generate filename if not provided
        if not output_filename:
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            output_filename = f"{template.form_type}_{timestamp}"

        # Build file path
        file_path = _build_file_path(
            tenant_id=work_item.tenant.id,
            form_type=template.form_type,
            work_item_ref=work_item.reference_id,
            filename=output_filename
        )

        # Ensure directory exists
        full_path = os.path.join(settings.MEDIA_ROOT, file_path)
        os.makedirs(os.path.dirname(full_path), exist_ok=True)

        # Generate PDF using Playwright
        _generate_pdf_with_playwright(html_content, full_path)

        logger.info(f"Successfully generated PDF for work item {work_item.reference_id} at {file_path}")
        return file_path

    except Exception as e:
        logger.error(f"Failed to generate PDF for work item {work_item.reference_id}: {str(e)}")
        raise PDFGenerationError(f"PDF generation failed: {str(e)}") from e


def _build_file_path(tenant_id, form_type, work_item_ref, filename):
    """
    Build the file path for a generated PDF using the configured pattern.

    Args:
        tenant_id: Tenant ID
        form_type: Form type (e.g., 'intake', 'invoice')
        work_item_ref: Work item reference ID
        filename: Base filename (without extension)

    Returns:
        str: Relative path from MEDIA_ROOT
    """
    # Get path pattern from settings (default pattern if not configured)
    path_pattern = getattr(
        settings,
        'FORM_DOCUMENTS_PATH',
        'documents/{tenant_id}/{form_type}/{work_item_ref}/'
    )

    # Format the path
    directory = path_pattern.format(
        tenant_id=tenant_id,
        form_type=form_type,
        work_item_ref=work_item_ref
    )

    # Add filename with .pdf extension
    return os.path.join(directory, f"{filename}.pdf")


def _generate_pdf_with_playwright(html_content, output_path):
    """
    Generate PDF from HTML using Playwright's headless browser.

    Args:
        html_content: HTML string to convert
        output_path: Full path where PDF should be saved

    Raises:
        PDFGenerationError: If Playwright fails to generate PDF
    """
    try:
        with sync_playwright() as p:
            # Launch headless Chromium browser
            browser = p.chromium.launch(headless=True)
            page = browser.new_page()

            # Set HTML content
            page.set_content(html_content, wait_until='networkidle')

            # Generate PDF with A4 page size
            page.pdf(
                path=output_path,
                format='A4',
                print_background=True,  # Include background colors/images
                margin={
                    'top': '10mm',
                    'bottom': '10mm',
                    'left': '10mm',
                    'right': '10mm'
                }
            )

            browser.close()

        logger.debug(f"PDF generated successfully at {output_path}")

    except Exception as e:
        logger.error(f"Playwright PDF generation failed: {str(e)}")
        raise PDFGenerationError(f"Playwright error: {str(e)}") from e


def preview_html(work_item, template):
    """
    Generate preview HTML with variables replaced (for template preview).

    Args:
        work_item: WorkItem instance
        template: FormTemplate instance

    Returns:
        str: HTML with all variables replaced
    """
    try:
        variables = get_template_variables(work_item)
        return replace_variables_in_html(template.html_content, variables)
    except Exception as e:
        logger.error(f"Failed to generate preview HTML: {str(e)}")
        raise PDFGenerationError(f"Preview generation failed: {str(e)}") from e


def get_sample_variables():
    """
    Get sample/mock variables for template preview without a real work item.

    Returns:
        dict: Sample variables
    """
    return {
        # Customer
        'customer.full_name': 'Jan Kowalski',
        'fio': 'Jan Kowalski',
        'customer.first_name': 'Jan',
        'customer.last_name': 'Kowalski',
        'customer.phone': '789 000 000',
        'phone': '789 000 000',
        'customer.email': 'jan.kowalski@example.com',
        'email': 'jan.kowalski@example.com',
        'customer.address': 'ul. Testowa 123, 00-001 Warszawa, Polska',
        'customer.tax_code': '1234567890',

        # Work Item
        'workitem.reference_id': 'RMA-00123',
        'id': 'RMA-00123',
        'workitem.created_date': '30.11.2025',
        'now': '30.11.2025',
        'order_data': '30.11.2025',
        'workitem.created_date_time': '30.11.2025 14:30',
        'workitem.due_date': '07.12.2025',
        'workitem.status': 'New',
        'workitem.type': 'Chargeable Repair',
        'workitem.priority': 'Standard',
        'workitem.description': 'Ekran nie wyświetla obrazu',
        'defect': 'Ekran nie wyświetla obrazu',
        'workitem.device_condition': 'Rysy na obudowie, pęknięty ekran',
        'comment': 'Rysy na obudowie, pęknięty ekran',
        'workitem.accessories': 'Telefon, ładowarka, pudełko',
        'complect': 'Telefon, ładowarka, pudełko',
        'workitem.comments': 'Klient prosi o szybką naprawę',
        'workitem.prepaid_amount': '100.00',
        'prepay': '100.00',
        'workitem.estimated_price': '250.00',
        'workitem.final_price': '240.00',
        'workitem.repair_cost': '180.00',
        'workitem.payment_method': 'Card',
        'workitem.intake_method': 'Customer drop-off in person',

        # Asset/Device
        'asset.device_name': 'iPhone 13 Pro',
        'product': 'iPhone 13 Pro',
        'asset.device_model': 'A2638',
        'asset.device_manufacturer': 'Apple',
        'asset.serial_number': 'DMQWERTY123456',
        'serial': 'DMQWERTY123456',

        # Owner/Accepter
        'owner.full_name': 'Anna Nowak',
        'accepter': 'Anna Nowak',
        'owner.first_name': 'Anna',
        'owner.last_name': 'Nowak',
        'owner.email': 'anna.nowak@serwisfixed.pl',

        # Technician
        'technician.full_name': 'Piotr Wiśniewski',
        'technician.first_name': 'Piotr',
        'technician.last_name': 'Wiśniewski',
        'technician.email': 'piotr.wisniewski@serwisfixed.pl',

        # Locations
        'dropoff.name': 'FIXED Warszawa',
        'dropoff.address': 'Zamieniecka 55, 04-158 Warszawa',
        'dropoff.type': 'Shop',
        'pickup.name': 'FIXED Kraków',
        'pickup.address': 'ul. Floriańska 10, 31-021 Kraków',
        'pickup.type': 'Shop',

        # Shop
        'shop.name': 'FIXED Internal Workshop',
        'shop.type': 'Internal',

        # Current date/time
        'today': datetime.now().strftime('%d.%m.%Y'),
        'current_date': datetime.now().strftime('%d.%m.%Y'),
        'current_datetime': datetime.now().strftime('%d.%m.%Y %H:%M'),
        'current_time': datetime.now().strftime('%H:%M'),
    }
