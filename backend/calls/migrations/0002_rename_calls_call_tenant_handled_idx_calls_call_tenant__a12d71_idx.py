from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('calls', '0001_initial'),
    ]

    operations = [
        migrations.RenameIndex(
            model_name='call',
            new_name='calls_call_tenant__a12d71_idx',
            old_name='calls_call_tenant_handled_idx',
        ),
    ]
