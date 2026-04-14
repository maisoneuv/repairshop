from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('customers', '0011_add_phone_prefix'),
        ('tenants', '0001_initial'),
    ]

    operations = [
        # Add full_phone_number to Customer
        migrations.AddField(
            model_name='customer',
            name='full_phone_number',
            field=models.CharField(blank=True, db_index=True, max_length=20, null=True),
        ),

        # Drop old Lead table and recreate with new schema
        migrations.DeleteModel(
            name='Lead',
        ),
        migrations.CreateModel(
            name='Lead',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('first_name', models.CharField(max_length=100)),
                ('last_name', models.CharField(blank=True, max_length=100, null=True)),
                ('email', models.EmailField(blank=True, max_length=254, null=True)),
                ('prefix', models.CharField(blank=True, max_length=5, null=True)),
                ('phone_number', models.CharField(blank=True, max_length=15, null=True)),
                ('full_phone_number', models.CharField(blank=True, db_index=True, max_length=20, null=True)),
                ('device_description', models.TextField(blank=True, null=True)),
                ('notes', models.TextField(blank=True, null=True)),
                ('status', models.CharField(
                    choices=[('new', 'New'), ('contacted', 'Contacted'), ('converted', 'Converted')],
                    default='new',
                    max_length=20,
                )),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('tenant', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to='tenants.tenant')),
            ],
            options={
                'ordering': ['-created_at'],
            },
        ),
        migrations.AddConstraint(
            model_name='lead',
            constraint=models.UniqueConstraint(
                condition=models.Q(email__isnull=False),
                fields=['tenant', 'email'],
                name='unique_lead_email_per_tenant',
            ),
        ),
    ]
