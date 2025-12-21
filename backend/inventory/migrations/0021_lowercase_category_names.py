# Generated data migration to convert category names to lowercase

from django.db import migrations


def lowercase_category_names(apps, schema_editor):
    """
    Convert all existing category names to lowercase.
    This ensures consistency with the new Category.save() behavior.
    """
    Category = apps.get_model('inventory', 'Category')

    categories = Category.objects.all()
    count = categories.count()

    if count == 0:
        print("No categories found to convert.")
        return

    print(f"Converting {count} category names to lowercase...")

    for category in categories:
        original_name = category.name
        if category.name:
            category.name = category.name.lower()
            if original_name != category.name:
                print(f"  Converting: '{original_name}' -> '{category.name}'")
            # Use update_fields to avoid triggering MPTT rebuild on every save
            category.save(update_fields=['name'])

    print(f"Successfully converted {count} categories to lowercase.")


def reverse_lowercase(apps, schema_editor):
    """
    Reverse operation is not possible as we don't store the original case.
    This is intentionally left as a no-op.
    """
    print("Note: Reversing lowercase conversion is not supported (original case not stored).")
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('inventory', '0020_remove_device_categories'),
    ]

    operations = [
        migrations.RunPython(lowercase_category_names, reverse_lowercase),
    ]
