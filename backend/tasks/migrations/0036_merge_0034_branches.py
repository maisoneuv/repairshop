from django.db import migrations


class Migration(migrations.Migration):
    """
    Merge the two 0034 migrations so Django's migration graph has a single leaf.
    """

    dependencies = [
        ("tasks", "0034_alter_task_summary"),
        ("tasks", "0034_drop_old_documents_tables"),
    ]

    operations = []
