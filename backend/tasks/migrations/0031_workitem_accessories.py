from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("tasks", "0030_alter_task_summary"),
    ]

    operations = [
        migrations.AddField(
            model_name="workitem",
            name="accessories",
            field=models.TextField(blank=True, null=True),
        ),
    ]
