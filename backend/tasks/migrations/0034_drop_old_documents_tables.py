from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        ("tasks", "0033_add_search_indexes"),
    ]

    operations = [
        migrations.RunSQL(
            sql="DROP TABLE IF EXISTS documents_workitemreceipt CASCADE;",
            reverse_sql=migrations.RunSQL.noop,
        ),
        migrations.RunSQL(
            sql="DROP TABLE IF EXISTS documents_documenttemplate CASCADE;",
            reverse_sql=migrations.RunSQL.noop,
        ),
    ]
