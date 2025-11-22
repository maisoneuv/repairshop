from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("tasks", "0031_workitem_accessories"),
        ("tenants", "0001_initial"),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.AddField(
                    model_name="task",
                    name="actual_duration",
                    field=models.DurationField(
                        blank=True,
                        help_text="Calculated duration from creation to completion",
                        null=True,
                    ),
                ),
            ],
            database_operations=[
                migrations.RunSQL(
                    sql="""
                    ALTER TABLE tasks_task
                    ADD COLUMN IF NOT EXISTS actual_duration interval;
                    """,
                    reverse_sql="""
                    ALTER TABLE tasks_task
                    DROP COLUMN IF EXISTS actual_duration;
                    """,
                ),
            ],
        ),
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.AddField(
                    model_name="task",
                    name="completed_date",
                    field=models.DateTimeField(blank=True, null=True),
                ),
            ],
            database_operations=[
                migrations.RunSQL(
                    sql="""
                    ALTER TABLE tasks_task
                    ADD COLUMN IF NOT EXISTS completed_date timestamp with time zone;
                    """,
                    reverse_sql="""
                    ALTER TABLE tasks_task
                    DROP COLUMN IF EXISTS completed_date;
                    """,
                ),
            ],
        ),
        migrations.AlterField(
            model_name="task",
            name="description",
            field=models.TextField(blank=True),
        ),
        migrations.AlterField(
            model_name="task",
            name="due_date",
            field=models.DateField(blank=True, null=True),
        ),
        migrations.AlterField(
            model_name="task",
            name="status",
            field=models.CharField(
                choices=[
                    ("To do", "To do"),
                    ("In progress", "In progress"),
                    ("Done", "Done"),
                    ("Reopened", "Reopened"),
                ],
                default="To do",
            ),
        ),
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.CreateModel(
                    name="TaskType",
                    fields=[
                        (
                            "id",
                            models.BigAutoField(
                                auto_created=True,
                                primary_key=True,
                                serialize=False,
                                verbose_name="ID",
                            ),
                        ),
                        ("name", models.CharField(max_length=100)),
                        (
                            "estimated_duration",
                            models.DurationField(
                                blank=True,
                                help_text="Estimated time to complete this type of task",
                                null=True,
                            ),
                        ),
                        ("is_active", models.BooleanField(default=True)),
                        ("created_date", models.DateTimeField(auto_now_add=True)),
                        (
                            "tenant",
                            models.ForeignKey(
                                on_delete=models.CASCADE,
                                to="tenants.tenant",
                            ),
                        ),
                    ],
                    options={
                        "ordering": ["name"],
                    },
                ),
            ],
            database_operations=[
                migrations.RunSQL(
                    sql="""
                    CREATE TABLE IF NOT EXISTS tasks_tasktype (
                        id BIGSERIAL PRIMARY KEY,
                        name varchar(100) NOT NULL,
                        estimated_duration interval NULL,
                        is_active boolean NOT NULL DEFAULT TRUE,
                        created_date timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
                        tenant_id bigint NOT NULL,
                        CONSTRAINT tasks_tasktype_tenant_id_fk
                            FOREIGN KEY (tenant_id)
                            REFERENCES tenants_tenant(id)
                            DEFERRABLE INITIALLY DEFERRED
                    );
                    """,
                    reverse_sql="DROP TABLE IF EXISTS tasks_tasktype CASCADE;",
                ),
            ],
        ),
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.AddField(
                    model_name="task",
                    name="task_type",
                    field=models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=models.PROTECT,
                        related_name="tasks",
                        to="tasks.tasktype",
                    ),
                ),
            ],
            database_operations=[
                migrations.RunSQL(
                    sql="""
                    ALTER TABLE tasks_task
                    ADD COLUMN IF NOT EXISTS task_type_id bigint;
                    """,
                    reverse_sql="""
                    ALTER TABLE tasks_task
                    DROP COLUMN IF EXISTS task_type_id;
                    """,
                ),
                migrations.RunSQL(
                    sql="""
                    DO $$
                    BEGIN
                        IF NOT EXISTS (
                            SELECT 1
                            FROM pg_constraint
                            WHERE conrelid = 'tasks_task'::regclass
                              AND contype = 'f'
                              AND conkey = ARRAY[
                                    (SELECT attnum::int2
                                     FROM pg_attribute
                                     WHERE attrelid = 'tasks_task'::regclass
                                       AND attname = 'task_type_id')
                                ]
                        ) THEN
                            ALTER TABLE tasks_task
                            ADD CONSTRAINT tasks_task_task_type_id_fk
                            FOREIGN KEY (task_type_id)
                            REFERENCES tasks_tasktype(id)
                            DEFERRABLE INITIALLY DEFERRED;
                        END IF;
                    END$$;
                    """,
                    reverse_sql="""
                    ALTER TABLE tasks_task
                    DROP CONSTRAINT IF EXISTS tasks_task_task_type_id_fk;
                    """,
                ),
            ],
        ),
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.CreateModel(
                    name="TaskTypeValidationRule",
                    fields=[
                        (
                            "id",
                            models.BigAutoField(
                                auto_created=True,
                                primary_key=True,
                                serialize=False,
                                verbose_name="ID",
                            ),
                        ),
                        (
                            "field_name",
                            models.CharField(
                                help_text="Name of the field that should be validated (e.g., 'description')",
                                max_length=100,
                            ),
                        ),
                        (
                            "is_required",
                            models.BooleanField(
                                default=True,
                                help_text="Whether this field must be filled before task completion",
                            ),
                        ),
                        (
                            "task_type",
                            models.ForeignKey(
                                on_delete=models.CASCADE,
                                related_name="validation_rules",
                                to="tasks.tasktype",
                            ),
                        ),
                    ],
                ),
            ],
            database_operations=[
                migrations.RunSQL(
                    sql="""
                    CREATE TABLE IF NOT EXISTS tasks_tasktypevalidationrule (
                        id BIGSERIAL PRIMARY KEY,
                        field_name varchar(100) NOT NULL,
                        is_required boolean NOT NULL DEFAULT TRUE,
                        task_type_id bigint NOT NULL,
                        CONSTRAINT tasks_tasktypevalidationrule_task_type_id_fk
                            FOREIGN KEY (task_type_id)
                            REFERENCES tasks_tasktype(id)
                            DEFERRABLE INITIALLY DEFERRED
                    );
                    """,
                    reverse_sql="DROP TABLE IF EXISTS tasks_tasktypevalidationrule CASCADE;",
                ),
            ],
        ),
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.AddConstraint(
                    model_name="tasktype",
                    constraint=models.UniqueConstraint(
                        fields=("tenant", "name"),
                        name="unique_task_type_per_tenant",
                    ),
                ),
            ],
            database_operations=[
                migrations.RunSQL(
                    sql="""
                    DO $$
                    BEGIN
                        IF NOT EXISTS (
                            SELECT 1
                            FROM pg_constraint
                            WHERE conname = 'unique_task_type_per_tenant'
                        ) THEN
                            ALTER TABLE tasks_tasktype
                            ADD CONSTRAINT unique_task_type_per_tenant
                            UNIQUE (tenant_id, name);
                        END IF;
                    END$$;
                    """,
                    reverse_sql="""
                    ALTER TABLE tasks_tasktype
                    DROP CONSTRAINT IF EXISTS unique_task_type_per_tenant;
                    """,
                ),
            ],
        ),
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.AddConstraint(
                    model_name="tasktypevalidationrule",
                    constraint=models.UniqueConstraint(
                        fields=("task_type", "field_name"),
                        name="unique_validation_rule_per_field",
                    ),
                ),
            ],
            database_operations=[
                migrations.RunSQL(
                    sql="""
                    DO $$
                    BEGIN
                        IF NOT EXISTS (
                            SELECT 1
                            FROM pg_constraint
                            WHERE conname = 'unique_validation_rule_per_field'
                        ) THEN
                            ALTER TABLE tasks_tasktypevalidationrule
                            ADD CONSTRAINT unique_validation_rule_per_field
                            UNIQUE (task_type_id, field_name);
                        END IF;
                    END$$;
                    """,
                    reverse_sql="""
                    ALTER TABLE tasks_tasktypevalidationrule
                    DROP CONSTRAINT IF EXISTS unique_validation_rule_per_field;
                    """,
                ),
            ],
        ),
    ]
