"""Guided work-item process — the state machine.

The single place stage state moves. Every function here:
  * updates `WorkItem.current_stage` / `progress`,
  * writes an append-only `StageTransition` (the audit + timeline source),
  * **dual-writes** the legacy `WorkItem.status` from the stage's `status_value`
    (so the old UI stays correct while the flag is on), and
  * applies the role/handoff/pause rules and raises `Notification`s.

Only invoked on the guided path (behind the `workitem.guided_process` flag);
the legacy status flow never calls into here.

See design/work-item-detail-redesign/WORK_ITEM_DETAIL_MODEL.md §2–6 & §7E.
"""
from django.db import transaction
from django.utils import timezone

from .models import (
    ProcessTemplate, StageDefinition, WorkItemPause, StageTransition, Notification,
)


# --- role resolution --------------------------------------------------------

def responsible_employee(work_item, stage):
    """The Employee responsible while a work item sits in `stage`, resolved from
    the stage's owner_role against the work item's own Owner/Technician slots.
    Returns None for role 'any' or when the slot is empty. In a solo shop Owner
    and Technician are the same Employee, so every role resolves to one person —
    which is why handoffs and bounces collapse to nothing there."""
    if stage is None:
        return None
    if stage.owner_role == 'technician':
        return work_item.technician
    if stage.owner_role == 'owner':
        return work_item.owner
    return None


def _label(work_item):
    """Short human label for notifications."""
    return work_item.reference_id or f"Work item #{work_item.pk}"


def _notify(work_item, employee, ntype, text):
    if employee is None:
        return None
    return Notification.objects.create(
        tenant=work_item.tenant, recipient=employee, work_item=work_item,
        type=ntype, text=text,
    )


def _apply_stage(work_item, stage, progress, extra_fields=None, from_stage=None):
    """Set current_stage/progress + dual-write legacy status, in one save."""
    work_item.current_stage = stage
    work_item.progress = progress
    fields = ['current_stage', 'progress']
    if stage and stage.status_value:
        work_item.status = stage.status_value
        fields.append('status')
    if stage and stage.key == 'closed' and work_item.closed_date is None:
        work_item.closed_date = timezone.now()
        fields.append('closed_date')
    # Reopening: leaving the closing stage un-closes the repair, so the stamp
    # that says when it was closed has to go with it.
    elif (from_stage is not None and from_stage.key == 'closed'
          and (stage is None or stage.key != 'closed')
          and work_item.closed_date is not None):
        work_item.closed_date = None
        fields.append('closed_date')
    for k, v in (extra_fields or {}).items():
        setattr(work_item, k, v)
        fields.append(k)
    # The StageTransition below is the record of this move; the legacy
    # status-change note (tasks/signals.py) would only duplicate it on the
    # timeline, so tell that signal to sit this one out.
    work_item._skip_status_note = True
    work_item.save(update_fields=fields)


# --- lifecycle --------------------------------------------------------------

@transaction.atomic
def begin_process(work_item, process=None, by_user=None):
    """Put a work item onto the guided flow at the first stage of the default
    (or given) process. No-op if the tenant has no process template."""
    process = process or ProcessTemplate.objects.filter(
        tenant=work_item.tenant, is_default=True,
    ).first()
    if process is None:
        return work_item
    first = process.stages.order_by('order').first()
    if first is None:
        return work_item
    _apply_stage(work_item, first, 'in_progress')
    StageTransition.objects.create(
        work_item=work_item, from_stage=None, to_stage=first, kind='start',
        by_user=by_user, started_at=timezone.now(),
    )
    return work_item


@transaction.atomic
def start_stage(work_item, by_user=None):
    """Manual claim from the queue's To-start inbox: Pending → In progress."""
    if work_item.progress != 'pending':
        return work_item
    work_item.progress = 'in_progress'
    work_item.save(update_fields=['progress'])
    StageTransition.objects.create(
        work_item=work_item, from_stage=work_item.current_stage,
        to_stage=work_item.current_stage, kind='start', by_user=by_user,
        started_at=timezone.now(),
    )
    return work_item


@transaction.atomic
def advance_stage(work_item, outcome=None, target_stage=None, by_user=None,
                  captured_values=None, note='', kind=None):
    """Advance (or Exit, or move Back) to another stage.

    Pass an `outcome` (a StageOutcome, kind advance|exit) or an explicit
    `target_stage`. Clears any pause, moves the stage, dual-writes status, writes
    the transition, and — if the new stage is owned by a *different* person
    (a handoff) — leaves it Pending and notifies that person.

    `kind` overrides how the move is recorded; callers pass 'back' for a
    correction to an earlier stage. The mechanics are identical either way —
    handoff detection included, so returning work to an earlier stage owned by
    someone else lands in *their* queue and pings them, exactly as it should.
    """
    from_stage = work_item.current_stage
    to_stage = target_stage or (outcome.target_stage if outcome else None)
    if to_stage is None:
        raise ValueError("advance_stage needs an outcome with a target_stage or a target_stage")

    kind = kind or ('exit' if (outcome and outcome.kind == 'exit') else 'advance')
    now = timezone.now()

    # advancing always clears any pause
    WorkItemPause.objects.filter(work_item=work_item).delete()

    prev_person = responsible_employee(work_item, from_stage)
    new_person = responsible_employee(work_item, to_stage)
    is_handoff = new_person is not None and new_person != prev_person
    progress = 'pending' if is_handoff else 'in_progress'

    _apply_stage(work_item, to_stage, progress, from_stage=from_stage)

    StageTransition.objects.create(
        work_item=work_item, from_stage=from_stage, to_stage=to_stage, kind=kind,
        by_user=by_user, note=note or (outcome.label if outcome else ''),
        captured_values=captured_values or {},
        assigned_at=now if is_handoff else None,
        started_at=None if is_handoff else now,
    )

    if is_handoff:
        verb = 'back with you' if kind == 'back' else 'handed to you'
        _notify(work_item, new_person, 'handoff',
                f"{_label(work_item)} {verb} — {to_stage.name}")
    return work_item


@transaction.atomic
def pause(work_item, outcome=None, waiting_on=None, reason='', reassign_to_owner=False,
          resolve_label='', by_user=None):
    """Put the current stage on hold (stays in the same stage). If the pause
    needs customer contact from a Technician stage it bounces to the Owner
    (a one-way hold) and notifies them."""
    stage = work_item.current_stage
    if outcome is not None:
        waiting_on = outcome.waiting_on
        reason = reason or outcome.label
        reassign_to_owner = outcome.reassign_to_owner
        resolve_label = outcome.resolve_label
    if not waiting_on:
        raise ValueError("pause needs a waiting_on (customer|supplier)")

    current_person = responsible_employee(work_item, stage)
    owner_person = work_item.owner
    # a real reassignment only if the owner is a different person than who holds it now
    reassigned = bool(reassign_to_owner and owner_person is not None
                      and owner_person != current_person)
    held_by = 'owner' if reassigned else (stage.owner_role if stage else '')

    WorkItemPause.objects.filter(work_item=work_item).delete()
    WorkItemPause.objects.create(
        work_item=work_item, waiting_on=waiting_on, reason=reason,
        held_by=held_by, reassigned=reassigned, resolve_label=resolve_label,
    )
    StageTransition.objects.create(
        work_item=work_item, from_stage=stage, to_stage=stage, kind='pause',
        by_user=by_user, note=reason,
    )
    if reassigned:
        _notify(work_item, owner_person, 'bounce',
                f"{_label(work_item)} needs a customer call — {reason}")
    return work_item


@transaction.atomic
def resolve_pause(work_item, by_user=None, note=''):
    """Clear the active pause, return to In progress. If it had bounced to the
    Owner, control returns to the stage's own role (e.g. back to the Technician)
    and that person is notified."""
    pause_row = WorkItemPause.objects.filter(work_item=work_item).first()
    if pause_row is None:
        return work_item
    stage = work_item.current_stage
    bounced = pause_row.reassigned
    resolve_label = pause_row.resolve_label
    pause_row.delete()

    work_item.progress = 'in_progress'
    work_item.save(update_fields=['progress'])
    StageTransition.objects.create(
        work_item=work_item, from_stage=stage, to_stage=stage, kind='resolve',
        by_user=by_user, note=note or resolve_label,
    )
    if bounced:
        back_person = responsible_employee(work_item, stage)
        _notify(work_item, back_person, 'resolved',
                f"{_label(work_item)} — back to you")
    return work_item
