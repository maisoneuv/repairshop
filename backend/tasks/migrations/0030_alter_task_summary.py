from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("tasks", "0029_alter_workitem_dropoff_method_and_more"),
    ]

    operations = [
        migrations.AlterField(
            model_name="task",
            name="summary",
            field=models.CharField(blank=True, max_length=255),
        ),
    ]
