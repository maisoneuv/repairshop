from django.db import transaction
from django.db.models.signals import post_save, pre_save
from django.dispatch import receiver

from .models import User
from .security import sign_out_everywhere


@receiver(pre_save, sender=User)
def _remember_was_active(sender, instance, update_fields=None, **kwargs):
    instance._was_active = False
    if instance.pk is None or (update_fields is not None and 'is_active' not in update_fields):
        return
    instance._was_active = User.objects.filter(pk=instance.pk, is_active=True).exists()


@receiver(post_save, sender=User)
def _sign_out_on_deactivation(sender, instance, created, **kwargs):
    # Deactivation alone only hides the session; reactivating the user would
    # bring a lost phone's session back to life.
    if getattr(instance, '_was_active', False) and not instance.is_active:
        transaction.on_commit(lambda: sign_out_everywhere(instance))
