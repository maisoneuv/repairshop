from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0028_email_models'),
    ]

    operations = [
        migrations.RenameModel(
            old_name='SentEmail',
            new_name='EmailMessage',
        ),
    ]
