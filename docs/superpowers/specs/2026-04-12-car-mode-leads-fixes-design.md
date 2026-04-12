# Design: Car Mode & Leads — poprawki funkcjonalności

**Data:** 2026-04-12  
**Branch:** feature/car-dashboard  
**Zakres:** 5 zgłoszonych problemów z Car Mode i LeadBoard

---

## Kontekst

Funkcjonalność Car Mode (dashboard do obsługi połączeń) i LeadBoard (lista leadów) zawiera kilka błędów i brakujących funkcji. Niniejsza specyfikacja opisuje wszystkie zmiany do implementacji.

---

## Problem 1 — Aktywne zgłoszenia klienta w Car Mode

### Stan obecny (zepsuty)

W `customer_lookup` (`backend/customers/views.py`) są dwa bugi:

**Bug A:** Gdy połączenie ma już przypisanego klienta (`call.customer`), `CallSerializer` zwraca surowe ID (liczbę całkowitą). W `handleCallClick` frontend ustawia `data: call.customer` = liczba, więc `foundData.data?.id` i `foundData.data?.latest_work_item` zawsze `undefined`. Przycisk "Otwórz profil klienta" nigdy się nie pojawia.

**Bug B:** Endpoint `customer_lookup` nie zwraca `id` w obiekcie klienta. Pole `latest_work_item` jest na poziomie `result.latest_work_item`, ale frontend szuka go w `result.customer.latest_work_item` — nigdy nie wyświetla się.

### Rozwiązanie — Backend

Zmieniamy `customer_lookup` w `backend/customers/views.py`:

1. Dodajemy `id` do `customer_data`
2. Zamiast `latest_work_item` zwracamy:
   - `active_work_items` — lista max 3 najnowszych, `status != 'Resolved'`, pola: `id`, `reference_id`, `status`, `device_model`, `created_date`
   - `latest_closed_work_item` — ostatnie z `status == 'Resolved'`, te same pola (fallback gdy brak aktywnych)

```python
active_qs = WorkItem.objects.filter(
    tenant=tenant, customer=customer
).exclude(status='Resolved').select_related(
    'customer_asset__device'
).order_by('-created_date')[:3]

latest_closed = WorkItem.objects.filter(
    tenant=tenant, customer=customer, status='Resolved'
).select_related('customer_asset__device').order_by('-created_date').first()
```

### Rozwiązanie — Frontend

`CallSerializer` zwraca `customer` i `lead` jako surowe ID (liczby całkowite) — to dotyczy obydwu przypadków.

**Dla klienta:** W `handleCallClick` gdy `call.customer` jest ustawione, wywołujemy `lookupByPhone(call.phone_number, call.id)` — ta sama ścieżka co dla nieznanych numerów. Gwarantuje pełne dane z backendu.

**Dla leada:** W `handleCallClick` gdy `call.lead` jest ustawione, wywołujemy nową funkcję `getLead(call.lead)` z `api/leads.js` (GET `/api/customers/api/leads/{id}/`). Zwraca pełny obiekt leada z id, first_name, last_name, device_description, notes. Dopiero potem `setFoundData({ type: "lead", data: leadObj, ... })`.

W widoku "found" (klient) wyświetlamy:
- Jeśli `active_work_items.length > 0`: lista do 3 pozycji, każda klikalny link do `/work-items/${id}`, format: `RMA-42 · W naprawie · iPhone 13`
- Jeśli brak aktywnych i `latest_closed_work_item` istnieje: "Ostatnie zamknięte: RMA-38 · Resolved · Samsung A52"
- Jeśli brak wszystkich: nic nie pokazujemy

---

## Problem 2 — Notatki z Car Mode nie trafiają do leada

### Stan obecny

`markCallHandled(callId, notes)` zapisuje notatki wyłącznie w `Call.notes`. Gdy obsługiwane połączenie dotyczy leada, jego pole `Lead.notes` pozostaje niezmienione.

### Rozwiązanie — Backend

W `mark_handled` (`backend/calls/views.py`), po zapisaniu `Call`, jeśli `call.lead` istnieje i notes są niepuste:

```python
if call.lead and request.data.get('notes', '').strip():
    lead = call.lead
    new_note = f"[{timezone.now().strftime('%Y-%m-%d')}] {request.data['notes'].strip()}"
    if lead.notes:
        lead.notes = f"{lead.notes}\n{new_note}"
    else:
        lead.notes = new_note
    lead.save(update_fields=['notes'])
```

---

## Problem 3 — Nie można edytować danych leada z Car Mode

### Rozwiązanie — Frontend

W widoku "found" gdy `foundData.type === "lead"`, dodajemy sekcję edycji pod kartą z danymi. Pola inline (nie nowy widok):
- Imię (`first_name`)
- Nazwisko (`last_name`)
- Opis sprzętu (`device_description`)

Pola pre-wypełnione z `foundData.data`. Stan lokalny `leadEdits` przechowuje zmiany.

Zapis odbywa się **przy "Obsłużone ✓"** w jednej akcji razem z notatkami:
```
handleMarkHandled:
  1. markCallHandled(callId, callNotes)          — notatki → Call + Lead.notes (backend)
  2. jeśli leadEdits niepuste → updateLead(id, leadEdits)  — dane leada
  3. reset stanu, powrót do idle
```

---

## Problem 4 — Brak edycji leadów w LeadBoard

### Rozwiązanie — Frontend

W tabeli `LeadBoard.jsx` dodajemy przycisk "Edytuj" obok "Konwertuj" dla każdego niekonwertowanego leada.

Klik otwiera `QuickLeadModal` w trybie `"edit"` z `initialData` wypełnionym danymi leada. Submit → `updateLead(id, form)` → aktualizuje wiersz w tabeli (bez przeładowania), zamyka modal.

---

## Problem 5 — Przycisk tworzenia leada w headerze

### Rozwiązanie — Frontend

W `AppLayout.jsx` w prawym rogu nawigacji, obok istniejącego przycisku `+` (work items), dodajemy nowy przycisk z ikoną `UserPlus` (Lucide). Klik otwiera `QuickLeadModal` w trybie `"create"`. Po zapisie modal zamykany cicho (bez przekierowania).

---

## Nowy komponent: `QuickLeadModal`

**Plik:** `frontend/src/components/QuickLeadModal.jsx`

**Props:**
```typescript
{
  mode: "create" | "edit",
  initialData?: LeadFormData,   // wypełniony przy edit
  onClose: () => void,
  onSave: (lead: Lead) => void, // callback po udanym zapisie
}
```

**Zachowanie:**
- Tryb `"create"`: pusty formularz, `createLead(form)` na submit
- Tryb `"edit"`: formularz pre-wypełniony `initialData`, `updateLead(id, form)` na submit
- Pola: Imię*, Nazwisko, Prefix, Telefon, Opis sprzętu, Notatki
- Obsługa błędów inline
- `onSave(lead)` wywoływany z zapisanym obiektem → konsumenci aktualizują swój stan

**Używany przez:**
- `AppLayout.jsx` — tworzenie leada z headera
- `LeadBoard.jsx` — tworzenie (zastępuje obecny `LeadForm` + `Modal`) i edycja

---

## Pliki do zmiany

### Backend
| Plik | Zmiana |
|------|--------|
| `backend/customers/views.py` | `customer_lookup`: dodaj `id`, zmień `latest_work_item` → `active_work_items` + `latest_closed_work_item` |
| `backend/calls/views.py` | `mark_handled`: append notatek do `Lead.notes` |

### Frontend
| Plik | Zmiana |
|------|--------|
| `frontend/src/components/QuickLeadModal.jsx` | **Nowy plik** — wspólny modal tworzenia/edycji leada |
| `frontend/src/api/leads.js` | Dodaj `getLead(id)` → GET `/api/customers/api/leads/{id}/` |
| `frontend/src/pages/CarMode.jsx` | Fix `handleCallClick` (lookupByPhone dla klientów, getLead dla leadów), widok aktywnych zgłoszeń, inline edycja leada, zapis przy "Obsłużone" |
| `frontend/src/pages/LeadBoard.jsx` | Zastąp `LeadForm`+`Modal` przez `QuickLeadModal`, dodaj przycisk "Edytuj" |
| `frontend/src/layouts/AppLayout.jsx` | Przycisk `UserPlus` + stan `showLeadModal` + render `QuickLeadModal` |

---

## Brak zmian migracji

Wszystkie zmiany to logika widoków i frontend. Żadnych zmian modeli — brak migracji.
