"""
Variable mapping system for form templates.
Maps work item data to template variables like {{customer.name}}, {{workitem.reference_id}}, etc.
"""
from datetime import datetime
from collections import OrderedDict


def get_available_merge_fields():
    """
    Returns structured merge field data for the selector widget.

    Returns:
        OrderedDict: Categories with their fields and variable paths
        {
            "Customer": {
                "Full Name": "customer.full_name",
                "First Name": "customer.first_name",
                ...
            },
            ...
        }
    """
    fields = OrderedDict()

    # Customer Fields
    fields["Customer"] = OrderedDict([
        ("Full Name", "customer.full_name"),
        ("First Name", "customer.first_name"),
        ("Last Name", "customer.last_name"),
        ("Phone Number", "customer.phone"),
        ("Email", "customer.email"),
        ("Address (Full)", "customer.address"),
        ("Address - Street", "customer.address.street"),
        ("Address - City", "customer.address.city"),
        ("Address - Postal Code", "customer.address.postal_code"),
        ("Address - Country", "customer.address.country"),
        ("Tax Code", "customer.tax_code"),
    ])

    # Work Item Fields
    fields["Work Item"] = OrderedDict([
        ("Reference ID", "workitem.reference_id"),
        ("Created Date", "workitem.created_date"),
        ("Created Date & Time", "workitem.created_date_time"),
        ("Due Date", "workitem.due_date"),
        ("Closed Date", "workitem.closed_date"),
        ("Status", "workitem.status"),
        ("Type", "workitem.type"),
        ("Priority", "workitem.priority"),
        ("Description", "workitem.description"),
        ("Device Condition", "workitem.device_condition"),
        ("Accessories", "workitem.accessories"),
        ("Comments", "workitem.comments"),
        ("Prepaid Amount", "workitem.prepaid_amount"),
        ("Estimated Price", "workitem.estimated_price"),
        ("Final Price", "workitem.final_price"),
        ("Repair Cost", "workitem.repair_cost"),
        ("Payment Method", "workitem.payment_method"),
        ("Intake Method", "workitem.intake_method"),
        ("Dropoff Method", "workitem.dropoff_method"),
    ])

    # Asset/Device Fields
    fields["Asset / Device"] = OrderedDict([
        ("Device Name", "asset.device_name"),
        ("Device Model", "asset.device_model"),
        ("Device Manufacturer", "asset.device_manufacturer"),
        ("Serial Number", "asset.serial_number"),
    ])

    # Owner (Staff) Fields
    fields["Staff - Owner"] = OrderedDict([
        ("Full Name", "owner.full_name"),
        ("First Name", "owner.first_name"),
        ("Last Name", "owner.last_name"),
        ("Email", "owner.email"),
    ])

    # Technician (Staff) Fields
    fields["Staff - Technician"] = OrderedDict([
        ("Full Name", "technician.full_name"),
        ("First Name", "technician.first_name"),
        ("Last Name", "technician.last_name"),
        ("Email", "technician.email"),
    ])

    # Dropoff Location Fields
    fields["Dropoff Location"] = OrderedDict([
        ("Name", "dropoff.name"),
        ("Address", "dropoff.address"),
        ("Type", "dropoff.type"),
    ])

    # Pickup Location Fields
    fields["Pickup Location"] = OrderedDict([
        ("Name", "pickup.name"),
        ("Address", "pickup.address"),
        ("Type", "pickup.type"),
    ])

    # Repair Shop Fields
    fields["Repair Shop"] = OrderedDict([
        ("Name", "shop.name"),
        ("Type", "shop.type"),
    ])

    # Current Date/Time Fields
    fields["Current Date / Time"] = OrderedDict([
        ("Today's Date", "today"),
        ("Current Date", "current_date"),
        ("Current Date & Time", "current_datetime"),
        ("Current Time", "current_time"),
    ])

    return fields


def get_template_variables(work_item):
    """
    Extract all available variables from a work item for template rendering.

    Args:
        work_item: WorkItem instance with related data loaded

    Returns:
        dict: Dictionary of all available template variables
    """
    variables = {}

    # ========================================================================
    # Customer Variables
    # ========================================================================
    if work_item.customer:
        customer = work_item.customer

        # Full name
        full_name = f"{customer.first_name or ''} {customer.last_name or ''}".strip()
        variables['customer.full_name'] = full_name

        # Individual name parts
        variables['customer.first_name'] = customer.first_name or ''
        variables['customer.last_name'] = customer.last_name or ''

        # Contact info
        variables['customer.phone'] = customer.phone_number or ''
        variables['customer.email'] = customer.email or ''

        # Address
        if customer.address:
            addr = customer.address
            address_parts = [
                addr.street or '',
                addr.city or '',
                addr.postal_code or '',
                addr.country or ''
            ]
            full_address = ', '.join(filter(None, address_parts))
            variables['customer.address'] = full_address
            variables['customer.address.street'] = addr.street or ''
            variables['customer.address.city'] = addr.city or ''
            variables['customer.address.postal_code'] = addr.postal_code or ''
            variables['customer.address.country'] = addr.country or ''
        else:
            variables['customer.address'] = ''

        # Tax code
        variables['customer.tax_code'] = customer.tax_code or ''
    else:
        # Set empty values if no customer
        for key in ['customer.full_name', 'customer.first_name', 'customer.last_name',
                    'customer.phone', 'customer.email', 'customer.address',
                    'customer.tax_code']:
            variables[key] = ''

    # ========================================================================
    # Work Item Variables
    # ========================================================================
    variables['workitem.reference_id'] = work_item.reference_id or ''

    # Dates
    if work_item.created_date:
        variables['workitem.created_date'] = format_date_polish(work_item.created_date)
        variables['workitem.created_date_time'] = format_datetime_polish(work_item.created_date)
    else:
        variables['workitem.created_date'] = ''
        variables['workitem.created_date_time'] = ''

    if work_item.due_date:
        variables['workitem.due_date'] = format_date_polish(work_item.due_date)
    else:
        variables['workitem.due_date'] = ''

    if work_item.closed_date:
        variables['workitem.closed_date'] = format_date_polish(work_item.closed_date)
    else:
        variables['workitem.closed_date'] = ''

    # Status and type
    variables['workitem.status'] = work_item.status or ''
    variables['workitem.type'] = work_item.type or ''
    variables['workitem.priority'] = work_item.priority or ''

    # Description and notes
    variables['workitem.description'] = work_item.description or ''
    variables['workitem.device_condition'] = work_item.device_condition or ''
    variables['workitem.accessories'] = work_item.accessories or ''
    variables['workitem.comments'] = work_item.comments or ''

    # Pricing
    variables['workitem.prepaid_amount'] = format_price(work_item.prepaid_amount)

    variables['workitem.estimated_price'] = format_price(work_item.estimated_price)
    variables['workitem.final_price'] = format_price(work_item.final_price)
    variables['workitem.repair_cost'] = format_price(work_item.repair_cost)

    # Payment and intake methods
    variables['workitem.payment_method'] = work_item.payment_method or ''
    variables['workitem.intake_method'] = work_item.get_intake_method_display() if work_item.intake_method else ''
    variables['workitem.dropoff_method'] = work_item.get_dropoff_method_display() if work_item.dropoff_method else ''

    # ========================================================================
    # Asset/Device Variables
    # ========================================================================
    if work_item.customer_asset:
        asset = work_item.customer_asset

        if asset.device:
            variables['asset.device_name'] = getattr(asset.device, 'name', '') or ''
            variables['asset.device_model'] = getattr(asset.device, 'model', '') or ''
            variables['asset.device_manufacturer'] = getattr(asset.device, 'manufacturer', '') or ''
        else:
            variables['asset.device_name'] = ''
            variables['asset.device_model'] = ''
            variables['asset.device_manufacturer'] = ''

        variables['asset.serial_number'] = asset.serial_number or ''
    else:
        for key in ['asset.device_name', 'asset.device_model',
                    'asset.device_manufacturer', 'asset.serial_number']:
            variables[key] = ''

    # ========================================================================
    # Employee Variables (Owner)
    # ========================================================================
    if work_item.owner:
        owner = work_item.owner
        owner_name = f"{owner.user.first_name or ''} {owner.user.last_name or ''}".strip()
        variables['owner.full_name'] = owner_name
        variables['owner.first_name'] = owner.user.first_name or ''
        variables['owner.last_name'] = owner.user.last_name or ''
        variables['owner.email'] = owner.user.email or ''
    else:
        for key in ['owner.full_name', 'owner.first_name',
                    'owner.last_name', 'owner.email']:
            variables[key] = ''

    # ========================================================================
    # Employee Variables (Technician)
    # ========================================================================
    if work_item.technician:
        tech = work_item.technician
        tech_name = f"{tech.user.first_name or ''} {tech.user.last_name or ''}".strip()
        variables['technician.full_name'] = tech_name
        variables['technician.first_name'] = tech.user.first_name or ''
        variables['technician.last_name'] = tech.user.last_name or ''
        variables['technician.email'] = tech.user.email or ''
    else:
        for key in ['technician.full_name', 'technician.first_name',
                    'technician.last_name', 'technician.email']:
            variables[key] = ''

    # ========================================================================
    # Location Variables
    # ========================================================================
    if work_item.dropoff_point:
        loc = work_item.dropoff_point
        variables['dropoff.name'] = loc.name or ''
        variables['dropoff.address'] = get_location_address(loc)
        variables['dropoff.type'] = loc.get_type_display() if loc.type else ''
    else:
        variables['dropoff.name'] = ''
        variables['dropoff.address'] = ''
        variables['dropoff.type'] = ''

    if work_item.pickup_point:
        loc = work_item.pickup_point
        variables['pickup.name'] = loc.name or ''
        variables['pickup.address'] = get_location_address(loc)
        variables['pickup.type'] = loc.get_type_display() if loc.type else ''
    else:
        variables['pickup.name'] = ''
        variables['pickup.address'] = ''
        variables['pickup.type'] = ''

    # ========================================================================
    # Repair Shop Variables
    # ========================================================================
    if work_item.fulfillment_shop:
        shop = work_item.fulfillment_shop
        variables['shop.name'] = shop.name or ''
        variables['shop.type'] = shop.get_shop_type_display() if shop.shop_type else ''
    else:
        variables['shop.name'] = ''
        variables['shop.type'] = ''

    # ========================================================================
    # Current Date/Time Variables
    # ========================================================================
    now = datetime.now()
    variables['today'] = format_date_polish(now)
    variables['current_date'] = format_date_polish(now)
    variables['current_datetime'] = format_datetime_polish(now)
    variables['current_time'] = now.strftime('%H:%M')

    return variables


def format_date_polish(date_obj):
    """Format date in Polish format: DD.MM.YYYY"""
    if not date_obj:
        return ''
    return date_obj.strftime('%d.%m.%Y')


def format_datetime_polish(datetime_obj):
    """Format datetime in Polish format: DD.MM.YYYY HH:MM"""
    if not datetime_obj:
        return ''
    return datetime_obj.strftime('%d.%m.%Y %H:%M')


def format_price(price):
    """Format decimal price with 2 decimal places"""
    if price is None:
        return '0.00'
    return f"{float(price):.2f}"


def get_location_address(location):
    """Get address string from a Location object"""
    if not location:
        return ''

    # If location has a freeform address
    if hasattr(location, 'freeform_address') and location.freeform_address:
        return location.freeform_address

    # If location has a related address
    if hasattr(location, 'address') and location.address:
        addr = location.address
        address_parts = [
            addr.street or '',
            addr.city or '',
            addr.postal_code or '',
            addr.country or ''
        ]
        return ', '.join(filter(None, address_parts))

    return ''


def replace_variables_in_html(html_content, variables):
    """
    Replace all {{variable}} placeholders in HTML with actual values.

    Args:
        html_content (str): HTML template with {{variable}} placeholders
        variables (dict): Dictionary of variable values

    Returns:
        str: HTML with all variables replaced
    """
    result = html_content

    for key, value in variables.items():
        # Replace {{key}} with value
        placeholder = f"{{{{{key}}}}}"
        result = result.replace(placeholder, str(value))

    return result
