"""Odczyt semantyki statusow z konfigurowalnych picklist.

Statusy zlecen sa definiowane per tenant i mieszaja jezyki ("Resolved",
"wydane_bez_naprawy", "UTYLIZACJA"), wiec sama nazwa nie mowi, czy naprawa
trwa. Ta informacja siedzi w `PicklistValue.status_role`.

Dlatego kod nie powinien porownywac statusu do literalu - inaczej zlecenie
wydane klientowi albo oddane do utylizacji liczyloby sie jako trwajaca
naprawa. Dodanie nowego statusu w CRM nie wymaga tu zmian: wystarczy,
ze admin nada mu role.
"""

from core.models import PicklistValue

WORKITEM_STATUS_CATEGORY = "workitem_status"

# Role oznaczajace, ze sprawa jest domknieta i nie nalezy jej pokazywac
# jako trwajacej naprawy.
CLOSED_ROLES = frozenset({"resolved", "cancelled"})


def workitem_status_index(tenant):
    """Slownik {wartosc statusu: PicklistValue} dla danego tenanta.

    Jedno zapytanie; wolajacy powinien przekazywac wynik dalej, zamiast
    pytac bazy przy kazdym zleceniu.
    """
    return {
        pv.value: pv
        for pv in PicklistValue.objects.filter(
            tenant=tenant, category=WORKITEM_STATUS_CATEGORY
        )
    }


def is_closed_status(status, index):
    """Czy status oznacza sprawe zamknieta.

    Status nieznany picklistcie traktujemy jako OTWARTY. Lepiej pokazac
    naprawe, ktorej juz nie ma, niz przemilczec te, ktora trwa - obsluga
    zweryfikuje to w rozmowie, a cisza jest nie do wykrycia.
    """
    pv = index.get(status)
    if pv is None or not pv.status_role:
        return False
    return pv.status_role in CLOSED_ROLES


def status_label(status, index):
    """Etykieta statusu przeznaczona dla czlowieka.

    Picklist trzyma czytelna nazwe ("Wydane bez naprawy") obok technicznej
    wartosci ("wydane_bez_naprawy"). Na ekranie polaczenia pokazujemy nazwe.
    """
    pv = index.get(status)
    if pv and pv.name:
        return pv.name
    return status or ""
