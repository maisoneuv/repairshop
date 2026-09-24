import django.utils.timezone
from django.db import migrations, models


def backfill_updated_date(apps, schema_editor):
    # Without this every existing row is stamped with the migration clock, so
    # the whole table reads as "updated a second ago".
    WorkItem = apps.get_model("tasks", "WorkItem")
    WorkItem.objects.update(updated_date=models.F("created_date"))


class Migration(migrations.Migration):

    dependencies = [
        ("tasks", "0050_alter_stagedefinition_recap_sources"),
    ]

    operations = [
        migrations.AddField(
            model_name="workitem",
            name="updated_date",
            field=models.DateTimeField(
                auto_now=True, default=django.utils.timezone.now
            ),
            preserve_default=False,
        ),
        migrations.RunPython(
            backfill_updated_date, migrations.RunPython.noop, elidable=True
        ),
    ]
