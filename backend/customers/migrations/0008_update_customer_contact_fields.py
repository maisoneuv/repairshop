from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("customers", "0007_alter_customer_options_customer_tenant_and_more"),
    ]

    operations = [
        migrations.AlterField(
            model_name="customer",
            name="last_name",
            field=models.CharField(blank=True, max_length=255, null=True),
        ),
        migrations.AlterField(
            model_name="customer",
            name="email",
            field=models.EmailField(blank=True, max_length=254, null=True),
        ),
        migrations.RemoveConstraint(
            model_name="customer",
            name="unique_customer_email_per_tenant",
        ),
        migrations.AddConstraint(
            model_name="customer",
            constraint=models.UniqueConstraint(
                condition=models.Q(email__isnull=False) & ~models.Q(email=""),
                fields=("tenant", "email"),
                name="unique_customer_email_per_tenant",
            ),
        ),
        migrations.AddConstraint(
            model_name="customer",
            constraint=models.UniqueConstraint(
                condition=models.Q(phone_number__isnull=False) & ~models.Q(phone_number=""),
                fields=("tenant", "phone_number"),
                name="unique_customer_phone_per_tenant",
            ),
        ),
        migrations.AddConstraint(
            model_name="customer",
            constraint=models.CheckConstraint(
                check=(
                    (models.Q(email__isnull=False) & ~models.Q(email=""))
                    | (models.Q(phone_number__isnull=False) & ~models.Q(phone_number=""))
                ),
                name="customer_requires_contact_method",
            ),
        ),
    ]
