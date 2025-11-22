# Migration to remove unique_together constraint
# This allows multiple sync records for update events

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('integrations', '0001_initial'),
    ]

    operations = [
        # Remove the unique_together constraint
        migrations.AlterUniqueTogether(
            name='integrationsync',
            unique_together=set(),
        ),
        # Add an index for better query performance
        migrations.AddIndex(
            model_name='integrationsync',
            index=models.Index(
                fields=['integration', 'content_type', 'object_id', 'event_type'],
                name='integration_lookup_idx'
            ),
        ),
    ]
