import django.db.models.deletion
from django.db import migrations, models


def copy_start_location(apps, schema_editor):
    """Routes used to start and end at their start location (the shop)."""
    Route = apps.get_model("appointments", "Route")
    for route in Route.objects.filter(start_location__isnull=False).select_related(
        "start_location__address", "start_location__shop__address",
    ):
        location = route.start_location
        address = location.address or (location.shop.address if location.shop_id else None)
        if address:
            route.start_address = route.end_address = address
            route.save(update_fields=["start_address", "end_address"])


class Migration(migrations.Migration):

    dependencies = [
        ('appointments', '0001_initial'),
        ('core', '0034_address_geocode_status_address_geocoded_at_and_more'),
        ('service', '0009_employee_is_driver'),
    ]

    operations = [
        migrations.AddField(
            model_name='route',
            name='start_address',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name='+', to='core.address'),
        ),
        migrations.AddField(
            model_name='route',
            name='end_address',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name='+', to='core.address'),
        ),
        migrations.RunPython(copy_start_location, migrations.RunPython.noop),
        migrations.RemoveField(
            model_name='route',
            name='start_location',
        ),
    ]
