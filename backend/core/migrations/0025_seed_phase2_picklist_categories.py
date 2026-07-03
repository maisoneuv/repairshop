from django.db import migrations

PHASE2_DEFAULTS = {
    'workitem_type': [
        {'name': 'Chargeable Repair', 'value': 'Chargeable Repair', 'color': 'sky',     'sort_order': 0},
        {'name': 'Warranty Repair',   'value': 'Warranty Repair',   'color': 'emerald', 'sort_order': 1},
    ],
    'workitem_priority': [
        {'name': 'Standard', 'value': 'Standard', 'color': 'gray',  'sort_order': 0},
        {'name': 'Express',  'value': 'Express',  'color': 'amber', 'sort_order': 1},
    ],
    'intake_method': [
        {'name': 'Customer drop-off in person',  'value': 'walk_in', 'color': 'gray',   'sort_order': 0},
        {'name': 'Courier',                      'value': 'courier', 'color': 'sky',    'sort_order': 1},
        {'name': 'Courier pickup from customer', 'value': 'driver',  'color': 'indigo', 'sort_order': 2},
    ],
    'dropoff_method': [
        {'name': 'Customer pick-up in person',    'value': 'walk_in', 'color': 'gray',   'sort_order': 0},
        {'name': 'Courier',                       'value': 'courier', 'color': 'sky',    'sort_order': 1},
        {'name': 'Courier delivery to customer',  'value': 'driver',  'color': 'indigo', 'sort_order': 2},
    ],
    'payment_method': [
        {'name': 'Card', 'value': 'Card', 'color': 'sky',   'sort_order': 0},
        {'name': 'Cash', 'value': 'Cash', 'color': 'amber', 'sort_order': 1},
    ],
    'employee_role': [
        {'name': 'Manager',          'value': 'Manager',          'color': 'purple', 'sort_order': 0},
        {'name': 'Technician',       'value': 'Technician',       'color': 'sky',    'sort_order': 1},
        {'name': 'Customer Service', 'value': 'Customer Service', 'color': 'teal',   'sort_order': 2},
        {'name': 'External Service', 'value': 'External Service', 'color': 'gray',   'sort_order': 3},
    ],
    'referral_source': [
        {'name': 'Internet Search',       'value': 'Internet Search',       'color': 'sky',    'sort_order': 0},
        {'name': 'Social Media',          'value': 'Social Media',          'color': 'indigo', 'sort_order': 1},
        {'name': 'Friend/Family',         'value': 'Friend/Family Referral','color': 'emerald','sort_order': 2},
        {'name': 'Online Advertisement',  'value': 'Online Advertisement',  'color': 'amber',  'sort_order': 3},
        {'name': 'Offline Advertisement', 'value': 'Offline Advertisement', 'color': 'orange', 'sort_order': 4},
        {'name': 'Walk-by',               'value': 'Walk-by',               'color': 'teal',   'sort_order': 5},
        {'name': 'Returning Customer',    'value': 'Returning Customer',    'color': 'purple', 'sort_order': 6},
        {'name': 'Other',                 'value': 'Other',                 'color': 'gray',   'sort_order': 7},
    ],
    'lead_status': [
        {'name': 'New',       'value': 'new',       'color': 'sky',     'sort_order': 0, 'status_role': 'initial'},
        {'name': 'Contacted', 'value': 'contacted', 'color': 'amber',   'sort_order': 1, 'status_role': 'in_progress'},
        {'name': 'Callback',  'value': 'callback',  'color': 'orange',  'sort_order': 2, 'status_role': 'in_progress'},
        {'name': 'Converted', 'value': 'converted', 'color': 'emerald', 'sort_order': 3, 'status_role': 'resolved'},
    ],
}


def seed_phase2_picklists(apps, _schema_editor):
    Tenant = apps.get_model('tenants', 'Tenant')
    PicklistValue = apps.get_model('core', 'PicklistValue')
    for tenant in Tenant.objects.all():
        for category, entries in PHASE2_DEFAULTS.items():
            for entry in entries:
                PicklistValue.objects.get_or_create(
                    tenant=tenant,
                    category=category,
                    value=entry['value'],
                    defaults={
                        'name': entry['name'],
                        'color': entry.get('color', 'gray'),
                        'sort_order': entry.get('sort_order', 0),
                        'is_system': True,
                        'is_active': True,
                        'status_role': entry.get('status_role'),
                    }
                )


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0024_add_status_role_and_transitions_to_picklist'),
        ('tenants', '0001_initial'),
    ]

    operations = [
        migrations.RunPython(seed_phase2_picklists, migrations.RunPython.noop),
    ]
