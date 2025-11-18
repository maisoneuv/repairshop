from django.contrib.postgres.search import SearchVectorField
from django.contrib.postgres.indexes import GinIndex
from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("customers", "0008_update_customer_contact_fields"),
    ]

    operations = [
        # Add GIN index on customer fields for full-text search performance
        migrations.RunSQL(
            sql="""
            CREATE INDEX customers_customer_search_idx ON customers_customer
            USING GIN (to_tsvector('english',
                coalesce(first_name, '') || ' ' ||
                coalesce(last_name, '') || ' ' ||
                coalesce(email, '') || ' ' ||
                coalesce(phone_number, '')
            ));
            """,
            reverse_sql="DROP INDEX IF EXISTS customers_customer_search_idx;"
        ),
    ]
