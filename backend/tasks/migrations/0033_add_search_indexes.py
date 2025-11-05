from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("tasks", "0032_task_actual_duration_task_completed_date_and_more"),
        ("customers", "0009_add_search_indexes"),
    ]

    operations = [
        # Add GIN index on work item fields for full-text search performance
        migrations.RunSQL(
            sql="""
            CREATE INDEX tasks_workitem_search_idx ON tasks_workitem
            USING GIN (to_tsvector('english',
                coalesce(reference_id, '') || ' ' ||
                coalesce(description, '') || ' ' ||
                coalesce(device_condition, '') || ' ' ||
                coalesce(accessories, '')
            ));
            """,
            reverse_sql="DROP INDEX IF EXISTS tasks_workitem_search_idx;"
        ),
    ]
