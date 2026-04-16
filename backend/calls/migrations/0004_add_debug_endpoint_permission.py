from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('calls', '0003_add_duration_status_to_call'),
    ]

    operations = [
        migrations.AlterModelOptions(
            name='call',
            options={
                'ordering': ['-created_at'],
                'permissions': [('access_debug_endpoint', 'Can access debug call endpoint')],
            },
        ),
    ]
