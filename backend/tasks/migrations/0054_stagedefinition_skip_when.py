from django.db import migrations, models


def types_to_conditions(apps, schema_editor):
    StageDefinition = apps.get_model('tasks', 'StageDefinition')
    for stage in StageDefinition.objects.exclude(skip_when_types=[]):
        types = stage.skip_when_types or []
        if not types:
            continue
        stage.skip_when = [{'field': 'type', 'in': types}]
        stage.save(update_fields=['skip_when'])


def conditions_to_types(apps, schema_editor):
    """Only type conditions survive going back — that is all the old field held."""
    StageDefinition = apps.get_model('tasks', 'StageDefinition')
    for stage in StageDefinition.objects.exclude(skip_when=[]):
        types = []
        for condition in stage.skip_when or []:
            if not isinstance(condition, dict) or condition.get('field') != 'type':
                continue
            if 'in' in condition:
                types += condition['in'] or []
            elif 'equals' in condition:
                types.append(condition['equals'])
        stage.skip_when_types = types
        stage.save(update_fields=['skip_when_types'])


class Migration(migrations.Migration):

    dependencies = [
        ('tasks', '0053_stagedefinition_skip_when_types'),
    ]

    operations = [
        migrations.AddField(
            model_name='stagedefinition',
            name='skip_when',
            field=models.JSONField(blank=True, default=list, help_text='Conditions under which this stage does not apply, as a list of objects — any one matching passes straight over the stage. Each names a `field` (a work item column or a custom field key) and either `equals` (one value) or `in` (a list), plus an optional `label` shown on the stepper. E.g. on Quote: [{"field": "type", "in": ["Warranty Repair"], "label": "Warranty job"}] — there is nothing to quote on a warranty job.'),
        ),
        migrations.RunPython(types_to_conditions, conditions_to_types),
        migrations.RemoveField(
            model_name='stagedefinition',
            name='skip_when_types',
        ),
    ]
