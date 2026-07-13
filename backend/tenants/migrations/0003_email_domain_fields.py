from django.db import migrations, models


def backfill_sending_slug(apps, schema_editor):
    """Default each tenant's sending slug to its (unique) subdomain."""
    TenantEmailSettings = apps.get_model('tenants', 'TenantEmailSettings')
    for settings_row in TenantEmailSettings.objects.select_related('tenant').iterator():
        TenantEmailSettings.objects.filter(pk=settings_row.pk).update(
            sending_slug=settings_row.tenant.subdomain,
        )


class Migration(migrations.Migration):

    dependencies = [
        ('tenants', '0002_tenant_email_settings'),
    ]

    operations = [
        migrations.RemoveField(model_name='tenantemailsettings', name='is_verified'),
        migrations.RemoveField(model_name='tenantemailsettings', name='verification_token'),
        migrations.RemoveField(model_name='tenantemailsettings', name='verification_sent_at'),
        migrations.RemoveField(model_name='tenantemailsettings', name='verified_at'),
        migrations.AddField(
            model_name='tenantemailsettings',
            name='sending_slug',
            field=models.SlugField(blank=True, null=True, unique=True),
        ),
        migrations.AddField(
            model_name='tenantemailsettings',
            name='reply_forward_email',
            field=models.EmailField(blank=True, max_length=254),
        ),
        migrations.AddField(
            model_name='tenantemailsettings',
            name='custom_domain',
            field=models.CharField(blank=True, max_length=253),
        ),
        migrations.AddField(
            model_name='tenantemailsettings',
            name='resend_domain_id',
            field=models.CharField(blank=True, max_length=64),
        ),
        migrations.AddField(
            model_name='tenantemailsettings',
            name='domain_status',
            field=models.CharField(choices=[('none', 'Not configured'), ('pending', 'Pending verification'), ('verified', 'Verified'), ('failed', 'Verification failed')], default='none', max_length=20),
        ),
        migrations.AddField(
            model_name='tenantemailsettings',
            name='dns_records',
            field=models.JSONField(blank=True, default=list),
        ),
        migrations.AddField(
            model_name='tenantemailsettings',
            name='domain_verified_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.RunPython(backfill_sending_slug, migrations.RunPython.noop),
    ]
