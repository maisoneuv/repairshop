# Car Mode & Leads — poprawki funkcjonalności — Plan Implementacji

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Naprawić 5 problemów z Car Mode dashboard i LeadBoard: aktywne zgłoszenia klienta, notatki, edycja leadów, edycja z poziomu Car Mode, przycisk tworzenia leada w headerze.

**Architecture:** Podejście B — wspólny `QuickLeadModal` reużywalny w `AppLayout` i `LeadBoard`; backend poprawki w `customer_lookup` i `mark_handled`; frontend poprawki w `CarMode.jsx`.

**Tech Stack:** Django REST Framework (backend), React 18 + Tailwind CSS (frontend), Docker Compose (środowisko uruchomieniowe)

**Spec:** `docs/superpowers/specs/2026-04-12-car-mode-leads-fixes-design.md`

---

## Mapa plików

| Plik | Akcja | Odpowiedzialność |
|------|-------|-----------------|
| `backend/customers/views.py` | Modify | Fix `customer_lookup`: dodaj `id`, zmień na `active_work_items` + `latest_closed_work_item` |
| `backend/customers/tests.py` | Modify | Testy dla `customer_lookup` |
| `backend/calls/views.py` | Modify | `mark_handled`: propaguj notatki do `Lead.notes` |
| `backend/calls/tests.py` | Create | Testy dla `mark_handled` + notatek |
| `frontend/src/api/leads.js` | Modify | Dodaj `getLead(id)` |
| `frontend/src/components/QuickLeadModal.jsx` | Create | Reużywalny modal tworzenia/edycji leada |
| `frontend/src/pages/CarMode.jsx` | Modify | Fix handleCallClick, widok zgłoszeń, inline edycja leada |
| `frontend/src/pages/LeadBoard.jsx` | Modify | Użyj QuickLeadModal, dodaj przycisk "Edytuj" |
| `frontend/src/layouts/AppLayout.jsx` | Modify | Przycisk UserPlus + QuickLeadModal |

---

## Zadanie 1: Fix `customer_lookup` — backend

**Pliki:**
- Modify: `backend/customers/views.py` (linie 371–507)
- Modify: `backend/customers/tests.py`

Obecny endpoint nie zwraca `id` klienta i zwraca `latest_work_item` bez rozróżnienia aktywne/zamknięte. Naprawiamy obie rzeczy.

- [ ] **Krok 1: Napisz testy (najpierw niech failują)**

Zawartość `backend/customers/tests.py`:

```python
from django.test import TestCase
from rest_framework.test import APIClient
from tenants.models import Tenant
from customers.models import Customer, Lead


class CustomerLookupAPITest(TestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(name="Test Tenant", subdomain="testco")
        self.customer = Customer.objects.create(
            tenant=self.tenant,
            first_name="Jan",
            last_name="Kowalski",
            phone_number="123456789",
        )
        self.client = APIClient()

    def _get(self, phone):
        return self.client.get(
            "/api/customers/api/customers/lookup/",
            {"phone": phone},
            HTTP_X_TENANT="testco",
        )

    def test_returns_customer_id(self):
        resp = self._get("123456789")
        self.assertEqual(resp.status_code, 200)
        self.assertIn("id", resp.json()["customer"])
        self.assertEqual(resp.json()["customer"]["id"], self.customer.id)

    def test_returns_active_work_items_key(self):
        resp = self._get("123456789")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn("active_work_items", data)
        self.assertIn("latest_closed_work_item", data)
        self.assertIsInstance(data["active_work_items"], list)

    def test_404_for_unknown_phone(self):
        resp = self._get("999999999")
        self.assertEqual(resp.status_code, 404)
```

- [ ] **Krok 2: Uruchom testy — muszą failować**

```bash
docker compose exec backend python manage.py test customers.tests.CustomerLookupAPITest --verbosity=2
```

Oczekiwane: `FAIL` — `KeyError: 'id'` lub `AssertionError` na strukturze odpowiedzi.

- [ ] **Krok 3: Zaimplementuj fix w `customer_lookup`**

W `backend/customers/views.py` zastąp całą funkcję `customer_lookup` (linie 371–507):

```python
@api_view(["GET"])
def customer_lookup(request):
    """
    Lookup customer by phone number.
    Returns customer info, active work items (status != 'Resolved'),
    and latest closed work item (status == 'Resolved') as fallback.
    """
    phone_param = request.GET.get('phone', '').strip()

    if not phone_param:
        return Response(
            {"error": "Phone number parameter is required"},
            status=400
        )

    tenant = getattr(request, 'tenant', None)
    if not tenant:
        return Response(
            {"error": "Tenant not resolved"},
            status=400
        )

    prefix = None
    phone_number = None

    try:
        parsed = phonenumbers.parse(phone_param, None)
        prefix = f"+{parsed.country_code}"
        phone_number = str(parsed.national_number)
    except NumberParseException:
        digits = ''.join(filter(str.isdigit, phone_param))
        if not digits:
            return Response(
                {"error": "Invalid phone number format"},
                status=400
            )

        if phone_param.strip().startswith('+'):
            for i in range(1, min(5, len(digits) + 1)):
                prefix_candidate = f"+{digits[:i]}"
                phone_candidate = digits[i:]
                customer = Customer.objects.filter(
                    tenant=tenant,
                    prefix=prefix_candidate,
                    phone_number=phone_candidate
                ).first()
                if customer:
                    prefix = prefix_candidate
                    phone_number = phone_candidate
                    break
            else:
                prefix = None
                phone_number = digits
        else:
            prefix = None
            phone_number = digits

    customer = None

    if prefix:
        customer = Customer.objects.filter(
            tenant=tenant,
            prefix=prefix,
            phone_number=phone_number
        ).select_related('address').first()

    if not customer:
        customer = Customer.objects.filter(
            tenant=tenant,
            phone_number=phone_number
        ).select_related('address').first()

    if not customer:
        return Response(
            {"error": "Customer not found"},
            status=404
        )

    customer_data = {
        "id": customer.id,
        "first_name": customer.first_name,
        "last_name": customer.last_name or "",
    }

    def _work_item_dict(wi):
        device_model = ""
        if wi.customer_asset and wi.customer_asset.device:
            device_model = wi.customer_asset.device.model or ""
        return {
            "id": wi.id,
            "reference_id": wi.reference_id or "",
            "status": wi.status,
            "device_model": device_model,
            "created_date": wi.created_date.isoformat() if wi.created_date else "",
        }

    active_qs = WorkItem.objects.filter(
        tenant=tenant,
        customer=customer,
    ).exclude(status='Resolved').select_related(
        'customer_asset__device'
    ).order_by('-created_date')[:3]

    active_work_items = [_work_item_dict(wi) for wi in active_qs]

    latest_closed_wi = WorkItem.objects.filter(
        tenant=tenant,
        customer=customer,
        status='Resolved'
    ).select_related('customer_asset__device').order_by('-created_date').first()

    latest_closed_work_item = _work_item_dict(latest_closed_wi) if latest_closed_wi else None

    return Response({
        "customer": customer_data,
        "active_work_items": active_work_items,
        "latest_closed_work_item": latest_closed_work_item,
    })
```

- [ ] **Krok 4: Uruchom testy — muszą przechodzić**

```bash
docker compose exec backend python manage.py test customers.tests.CustomerLookupAPITest --verbosity=2
```

Oczekiwane: 3x `OK`.

- [ ] **Krok 5: Commit**

```bash
git add backend/customers/views.py backend/customers/tests.py
git commit -m "fix: customer_lookup returns id and active/closed work items"
```

---

## Zadanie 2: Fix `mark_handled` — propagacja notatek do Lead

**Pliki:**
- Modify: `backend/calls/views.py`
- Create: `backend/calls/tests.py`

- [ ] **Krok 1: Utwórz plik testów `backend/calls/tests.py`**

```python
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient
from tenants.models import Tenant
from customers.models import Customer, Lead
from calls.models import Call
from core.models import User


class MarkHandledLeadNotesTest(TestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(name="Test Tenant", subdomain="callstest")
        self.user = User.objects.create_user(
            email="test@test.com",
            password="testpass",
            username="testuser",
            tenant=self.tenant,
        )
        self.lead = Lead.objects.create(
            tenant=self.tenant,
            first_name="Anna",
            phone_number="600100200",
        )
        self.call = Call.objects.create(
            tenant=self.tenant,
            phone_number="+48600100200",
            lead=self.lead,
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        self.client.credentials(HTTP_X_TENANT="callstest")

    def test_notes_appended_to_lead(self):
        resp = self.client.post(
            f"/api/calls/{self.call.id}/handled/",
            {"notes": "Klient zainteresowany"},
            format="json",
        )
        self.assertEqual(resp.status_code, 200)
        self.lead.refresh_from_db()
        self.assertIn("Klient zainteresowany", self.lead.notes)

    def test_notes_include_date_prefix(self):
        resp = self.client.post(
            f"/api/calls/{self.call.id}/handled/",
            {"notes": "test notatka"},
            format="json",
        )
        self.assertEqual(resp.status_code, 200)
        self.lead.refresh_from_db()
        today = timezone.now().strftime("%Y-%m-%d")
        self.assertIn(f"[{today}]", self.lead.notes)

    def test_notes_appended_to_existing(self):
        self.lead.notes = "Stara notatka"
        self.lead.save()
        self.client.post(
            f"/api/calls/{self.call.id}/handled/",
            {"notes": "Nowa notatka"},
            format="json",
        )
        self.lead.refresh_from_db()
        self.assertIn("Stara notatka", self.lead.notes)
        self.assertIn("Nowa notatka", self.lead.notes)

    def test_empty_notes_not_appended(self):
        self.client.post(
            f"/api/calls/{self.call.id}/handled/",
            {"notes": ""},
            format="json",
        )
        self.lead.refresh_from_db()
        self.assertIsNone(self.lead.notes)

    def test_no_lead_no_error(self):
        call_no_lead = Call.objects.create(
            tenant=self.tenant,
            phone_number="+48700100200",
        )
        resp = self.client.post(
            f"/api/calls/{call_no_lead.id}/handled/",
            {"notes": "notatka bez leada"},
            format="json",
        )
        self.assertEqual(resp.status_code, 200)
```

- [ ] **Krok 2: Uruchom testy — muszą failować**

```bash
docker compose exec backend python manage.py test calls.tests.MarkHandledLeadNotesTest --verbosity=2
```

Oczekiwane: `FAIL` — `AssertionError: None is not None` lub `lead.notes` jest None.

- [ ] **Krok 3: Zaimplementuj fix w `mark_handled`**

W `backend/calls/views.py` zastąp funkcję `mark_handled`:

```python
@api_view(['POST'])
@authentication_classes([SessionAuthentication, APIKeyAuthentication])
@permission_classes([IsAuthenticated])
def mark_handled(request, pk):
    """Car Mode - marks a call as handled and propagates notes to linked lead."""
    try:
        call = Call.objects.select_related('lead').get(pk=pk, tenant=request.tenant)
    except Call.DoesNotExist:
        return Response(status=404)

    call.handled_at = timezone.now()
    notes_text = request.data.get('notes', '').strip()
    if 'notes' in request.data:
        call.notes = request.data['notes']
    call.save(update_fields=['handled_at', 'notes'])

    if call.lead and notes_text:
        lead = call.lead
        new_note = f"[{timezone.now().strftime('%Y-%m-%d')}] {notes_text}"
        if lead.notes:
            lead.notes = f"{lead.notes}\n{new_note}"
        else:
            lead.notes = new_note
        lead.save(update_fields=['notes'])

    return Response(CallSerializer(call).data)
```

- [ ] **Krok 4: Uruchom testy**

```bash
docker compose exec backend python manage.py test calls.tests.MarkHandledLeadNotesTest --verbosity=2
```

Oczekiwane: 5x `OK`.

- [ ] **Krok 5: Commit**

```bash
git add backend/calls/views.py backend/calls/tests.py
git commit -m "fix: mark_handled propagates call notes to Lead.notes with date prefix"
```

---

## Zadanie 3: Frontend — `getLead` + nowy `QuickLeadModal`

**Pliki:**
- Modify: `frontend/src/api/leads.js`
- Create: `frontend/src/components/QuickLeadModal.jsx`

- [ ] **Krok 1: Dodaj `getLead` do `frontend/src/api/leads.js`**

Dodaj jedną linię na końcu pliku (po `convertLead`):

```javascript
export const getLead = (id) => api.get(`${BASE}${id}/`).then(r => r.data);
```

Pełna zawartość pliku po zmianie:

```javascript
import api from "./apiClient";

const BASE = "/api/customers/api/leads/";

export const listLeads   = ()         => api.get(BASE).then(r => r.data);
export const createLead  = (data)     => api.post(BASE, data).then(r => r.data);
export const updateLead  = (id, data) => api.patch(`${BASE}${id}/`, data).then(r => r.data);
export const convertLead = (id)       => api.post(`${BASE}${id}/convert/`).then(r => r.data);
export const getLead     = (id)       => api.get(`${BASE}${id}/`).then(r => r.data);
```

- [ ] **Krok 2: Utwórz `frontend/src/components/QuickLeadModal.jsx`**

```jsx
import { useState } from "react";
import { createLead, updateLead } from "../api/leads";

function Modal({ title, onClose, children }) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4">
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                    <h2 className="text-lg font-semibold text-gray-800">{title}</h2>
                    <button
                        type="button"
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-600 text-xl font-bold leading-none"
                    >
                        &times;
                    </button>
                </div>
                <div className="px-6 py-4">{children}</div>
            </div>
        </div>
    );
}

/**
 * QuickLeadModal — reużywalny modal do tworzenia i edycji leadów.
 *
 * Props:
 *   mode: "create" | "edit"
 *   initialData: obiekt leada (wymagany przy edit, zawiera id)
 *   onClose: () => void
 *   onSave: (savedLead) => void — wywoływany po udanym zapisie
 */
export default function QuickLeadModal({ mode, initialData, onClose, onSave }) {
    const [form, setForm] = useState({
        first_name: initialData?.first_name || "",
        last_name: initialData?.last_name || "",
        prefix: initialData?.prefix || "",
        phone_number: initialData?.phone_number || "",
        device_description: initialData?.device_description || "",
        notes: initialData?.notes || "",
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    function handle(e) {
        setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    }

    async function submit(e) {
        e.preventDefault();
        setLoading(true);
        setError("");
        try {
            const saved =
                mode === "edit"
                    ? await updateLead(initialData.id, form)
                    : await createLead(form);
            onSave(saved);
        } catch (err) {
            const detail = err.response?.data;
            if (typeof detail === "string") setError(detail);
            else if (detail?.non_field_errors) setError(detail.non_field_errors[0]);
            else setError("Błąd zapisu leadu.");
        } finally {
            setLoading(false);
        }
    }

    const inputCls =
        "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";
    const labelCls = "block text-xs font-medium text-gray-600 mb-1";

    return (
        <Modal title={mode === "edit" ? "Edytuj Lead" : "Nowy Lead"} onClose={onClose}>
            <form onSubmit={submit} className="space-y-3">
                {error && (
                    <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                        {error}
                    </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className={labelCls}>Imię *</label>
                        <input
                            name="first_name"
                            value={form.first_name}
                            onChange={handle}
                            className={inputCls}
                            required
                        />
                    </div>
                    <div>
                        <label className={labelCls}>Nazwisko</label>
                        <input
                            name="last_name"
                            value={form.last_name}
                            onChange={handle}
                            className={inputCls}
                        />
                    </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                    <div>
                        <label className={labelCls}>Prefix</label>
                        <input
                            name="prefix"
                            value={form.prefix}
                            onChange={handle}
                            placeholder="+48"
                            className={inputCls}
                        />
                    </div>
                    <div className="col-span-2">
                        <label className={labelCls}>Telefon</label>
                        <input
                            name="phone_number"
                            value={form.phone_number}
                            onChange={handle}
                            className={inputCls}
                        />
                    </div>
                </div>
                <div>
                    <label className={labelCls}>Opis sprzętu</label>
                    <input
                        name="device_description"
                        value={form.device_description}
                        onChange={handle}
                        className={inputCls}
                    />
                </div>
                <div>
                    <label className={labelCls}>Notatki</label>
                    <textarea
                        name="notes"
                        value={form.notes}
                        onChange={handle}
                        rows={2}
                        className={inputCls}
                    />
                </div>
                <div className="flex justify-end gap-2 pt-1">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200"
                    >
                        Anuluj
                    </button>
                    <button
                        type="submit"
                        disabled={loading}
                        className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                    >
                        {loading
                            ? "Zapisuję..."
                            : mode === "edit"
                            ? "Zapisz zmiany"
                            : "Zapisz lead"}
                    </button>
                </div>
            </form>
        </Modal>
    );
}
```

- [ ] **Krok 3: Commit**

```bash
git add frontend/src/api/leads.js frontend/src/components/QuickLeadModal.jsx
git commit -m "feat: add getLead API + QuickLeadModal reusable component"
```

---

## Zadanie 4: Fix `CarMode.jsx` — wszystkie 3 problemy frontendowe

**Pliki:**
- Modify: `frontend/src/pages/CarMode.jsx`

Naprawiamy jednocześnie: Bug A (call.customer to int), Bug B (zła struktura odpowiedzi), aktywne zgłoszenia, inline edycja leada.

- [ ] **Krok 1: Zastąp całą zawartość `frontend/src/pages/CarMode.jsx`**

```jsx
import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
    getPendingCalls,
    markCallHandled,
    lookupCustomerByPhone,
    createLeadFromCarMode,
} from "../api/carMode";
import { getLead, updateLead } from "../api/leads";

export default function CarMode() {
    const navigate = useNavigate();
    const [view, setView] = useState("idle"); // idle | found | notFound
    const [pendingCalls, setPendingCalls] = useState([]);
    const [activeCall, setActiveCall] = useState(null);
    const [foundData, setFoundData] = useState(null);
    // foundData shape for customer:
    //   { type:"customer", data:{id,first_name,last_name}, name, callId, phone,
    //     active_work_items:[{id,reference_id,status,device_model}],
    //     latest_closed_work_item:{...}|null }
    // foundData shape for lead:
    //   { type:"lead", data:{id,first_name,last_name,device_description,notes,...}, name, callId, phone }
    const [manualPhone, setManualPhone] = useState("");
    const [leadForm, setLeadForm] = useState({ first_name: "", last_name: "" });
    const [callNotes, setCallNotes] = useState("");
    const [leadEdits, setLeadEdits] = useState({});
    const [loadingCall, setLoadingCall] = useState(null);
    const [savingLead, setSavingLead] = useState(false);
    const [error, setError] = useState("");

    const fetchPending = useCallback(async () => {
        try {
            const calls = await getPendingCalls();
            setPendingCalls(Array.isArray(calls) ? calls : []);
        } catch (err) {
            if (err.response?.status === 401 || err.response?.status === 403) {
                setError("Brak autoryzacji – zaloguj się ponownie.");
            }
        }
    }, []);

    useEffect(() => {
        if (view !== "idle") return;
        fetchPending();
        const id = setInterval(fetchPending, 5000);
        return () => clearInterval(id);
    }, [view, fetchPending]);

    async function handleCallClick(call) {
        setLoadingCall(call.id);
        setError("");
        try {
            if (call.customer) {
                // Bug A fix: call.customer is a raw int ID — always do phone lookup for full data
                await lookupByPhone(call.phone_number, call.id);
            } else if (call.lead) {
                // Bug A fix for leads: call.lead is a raw int ID — fetch full lead object
                const lead = await getLead(call.lead);
                setFoundData({
                    type: "lead",
                    data: lead,
                    name: [lead.first_name, lead.last_name].filter(Boolean).join(" "),
                    callId: call.id,
                    phone: call.phone_number,
                });
                setLeadEdits({
                    first_name: lead.first_name || "",
                    last_name: lead.last_name || "",
                    device_description: lead.device_description || "",
                });
                setActiveCall(call);
                setView("found");
            } else {
                await lookupByPhone(call.phone_number, call.id);
            }
        } finally {
            setLoadingCall(null);
        }
    }

    async function handleManualSearch(e) {
        e.preventDefault();
        if (!manualPhone.trim()) return;
        setError("");
        setLoadingCall("manual");
        try {
            await lookupByPhone(manualPhone.trim(), null);
        } finally {
            setLoadingCall(null);
        }
    }

    async function lookupByPhone(phone, callId) {
        try {
            const result = await lookupCustomerByPhone(phone);
            if (result.customer) {
                setFoundData({
                    type: "customer",
                    name: `${result.customer.first_name} ${result.customer.last_name}`.trim(),
                    data: result.customer,
                    active_work_items: result.active_work_items || [],
                    latest_closed_work_item: result.latest_closed_work_item || null,
                    callId,
                    phone,
                });
                setView("found");
            }
        } catch (err) {
            if (err.response?.status === 404) {
                setLeadForm({ first_name: "", last_name: "", phone_number: phone });
                setFoundData({ type: "notFound", callId, phone });
                setView("notFound");
            } else {
                setError("Błąd wyszukiwania numeru.");
            }
        }
    }

    async function handleMarkHandled() {
        const callId = foundData?.callId || activeCall?.id;
        if (!callId) {
            resetToIdle();
            return;
        }
        try {
            // Backend mark_handled also propagates callNotes → lead.notes (append)
            await markCallHandled(callId, callNotes);
            setPendingCalls((prev) => prev.filter((c) => c.id !== callId));

            // Save lead field edits (name, device) if changed
            if (foundData?.type === "lead" && foundData?.data?.id) {
                const orig = foundData.data;
                const edits = {};
                if (leadEdits.first_name !== (orig.first_name || "")) edits.first_name = leadEdits.first_name;
                if (leadEdits.last_name !== (orig.last_name || "")) edits.last_name = leadEdits.last_name;
                if (leadEdits.device_description !== (orig.device_description || "")) edits.device_description = leadEdits.device_description;
                if (Object.keys(edits).length > 0) {
                    await updateLead(orig.id, edits).catch(() => {});
                }
            }
        } catch {
            // best effort
        }
        resetToIdle();
    }

    async function handleCreateLead(e) {
        e.preventDefault();
        setSavingLead(true);
        setError("");
        try {
            await createLeadFromCarMode({
                first_name: leadForm.first_name || foundData?.phone || "",
                last_name: leadForm.last_name,
                phone_number: foundData?.phone,
            });
            if (foundData?.callId) {
                await markCallHandled(foundData.callId).catch(() => {});
                setPendingCalls((prev) => prev.filter((c) => c.id !== foundData.callId));
            }
            resetToIdle();
        } catch (err) {
            const detail = err.response?.data;
            if (typeof detail === "string") setError(detail);
            else if (detail?.non_field_errors) setError(detail.non_field_errors[0]);
            else setError("Błąd zapisu leadu.");
        } finally {
            setSavingLead(false);
        }
    }

    function handleBack() {
        resetToIdle();
    }

    function resetToIdle() {
        setView("idle");
        setActiveCall(null);
        setFoundData(null);
        setCallNotes("");
        setLeadEdits({});
        setLeadForm({ first_name: "", last_name: "" });
        setError("");
    }

    const btnBase =
        "w-full py-4 rounded-2xl text-xl font-bold transition-colors focus:outline-none focus:ring-4";
    const inputDark =
        "w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500";

    return (
        <div className="min-h-screen bg-gray-900 text-white flex flex-col p-6">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <h1 className="text-3xl font-bold tracking-tight">
                    {view === "idle" && "Car Mode"}
                    {view === "found" &&
                        (foundData?.type === "customer" ? "Klient znaleziony" : "Lead")}
                    {view === "notFound" && "Nowy lead"}
                </h1>
                {view !== "idle" && (
                    <button onClick={handleBack} className="text-gray-400 hover:text-white text-lg">
                        ← Wróć
                    </button>
                )}
            </div>

            {error && (
                <div className="mb-4 rounded-xl bg-red-900/60 border border-red-700 px-4 py-3 text-sm text-red-300">
                    {error}
                </div>
            )}

            {/* IDLE VIEW */}
            {view === "idle" && (
                <div className="flex-1 flex flex-col gap-6">
                    <form onSubmit={handleManualSearch} className="flex gap-3">
                        <input
                            type="tel"
                            value={manualPhone}
                            onChange={(e) => setManualPhone(e.target.value)}
                            placeholder="Wpisz numer telefonu..."
                            className="flex-1 bg-gray-800 border border-gray-600 rounded-2xl px-5 py-4 text-2xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <button
                            type="submit"
                            disabled={loadingCall === "manual"}
                            className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-6 py-4 rounded-2xl text-lg disabled:opacity-50"
                        >
                            {loadingCall === "manual" ? "..." : "Szukaj"}
                        </button>
                    </form>

                    <div>
                        <h2 className="text-lg font-semibold text-gray-400 mb-3">
                            Oczekujące połączenia ({pendingCalls.length})
                        </h2>
                        {pendingCalls.length === 0 ? (
                            <div className="text-center py-16 text-gray-600 text-xl">
                                Brak połączeń
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {pendingCalls.map((call) => (
                                    <button
                                        key={call.id}
                                        onClick={() => handleCallClick(call)}
                                        disabled={loadingCall === call.id}
                                        className="w-full bg-gray-800 hover:bg-gray-700 rounded-2xl px-6 py-5 flex items-center justify-between text-left transition-colors disabled:opacity-50"
                                    >
                                        <div>
                                            <div className="text-2xl font-bold text-white">
                                                {call.phone_number}
                                            </div>
                                            <div className="text-sm text-gray-400 mt-1">
                                                {call.customer_name
                                                    ? `Klient: ${call.customer_name}`
                                                    : call.lead_name
                                                    ? `Lead: ${call.lead_name}`
                                                    : "Nieznany numer"}
                                            </div>
                                        </div>
                                        <div className="text-gray-500 text-2xl">
                                            {loadingCall === call.id ? "⟳" : "→"}
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* FOUND VIEW */}
            {view === "found" && foundData && (
                <div className="flex-1 flex flex-col gap-6">
                    {/* Customer/Lead card */}
                    <div className="bg-gray-800 rounded-2xl px-6 py-6">
                        <div className="text-sm text-gray-400 mb-1 uppercase tracking-wide">
                            {foundData.type === "customer" ? "Klient" : "Lead"}
                        </div>
                        <div className="text-3xl font-bold text-white mb-2">
                            {foundData.name || "—"}
                        </div>
                        <div className="text-xl text-gray-300">
                            {activeCall?.phone_number || foundData.phone || "—"}
                        </div>

                        {/* Work items for customers */}
                        {foundData.type === "customer" && (
                            <>
                                {foundData.active_work_items?.length > 0 ? (
                                    <div className="mt-4">
                                        <div className="text-xs text-gray-500 uppercase tracking-wide mb-2">
                                            Aktywne zgłoszenia
                                        </div>
                                        <div className="space-y-1">
                                            {foundData.active_work_items.map((wi) => (
                                                <button
                                                    key={wi.id}
                                                    onClick={() => navigate(`/work-items/${wi.id}`)}
                                                    className="block w-full text-left text-sm text-blue-400 hover:text-blue-300 py-1"
                                                >
                                                    {wi.reference_id} · {wi.status}
                                                    {wi.device_model ? ` · ${wi.device_model}` : ""}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                ) : foundData.latest_closed_work_item ? (
                                    <div className="mt-4 text-sm text-gray-400">
                                        Ostatnie zamknięte:{" "}
                                        <button
                                            onClick={() =>
                                                navigate(`/work-items/${foundData.latest_closed_work_item.id}`)
                                            }
                                            className="text-gray-300 hover:text-white"
                                        >
                                            {foundData.latest_closed_work_item.reference_id}
                                            {foundData.latest_closed_work_item.device_model
                                                ? ` · ${foundData.latest_closed_work_item.device_model}`
                                                : ""}
                                        </button>
                                    </div>
                                ) : null}
                            </>
                        )}
                    </div>

                    {/* Lead inline edit — imię, nazwisko, sprzęt */}
                    {foundData.type === "lead" && (
                        <div className="bg-gray-800 rounded-2xl px-6 py-5 space-y-3">
                            <div className="text-xs text-gray-500 uppercase tracking-wide">
                                Dane leada
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs text-gray-400 mb-1">Imię</label>
                                    <input
                                        value={leadEdits.first_name ?? ""}
                                        onChange={(e) =>
                                            setLeadEdits((p) => ({ ...p, first_name: e.target.value }))
                                        }
                                        className={inputDark}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs text-gray-400 mb-1">
                                        Nazwisko
                                    </label>
                                    <input
                                        value={leadEdits.last_name ?? ""}
                                        onChange={(e) =>
                                            setLeadEdits((p) => ({ ...p, last_name: e.target.value }))
                                        }
                                        className={inputDark}
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs text-gray-400 mb-1">
                                    Opis sprzętu
                                </label>
                                <input
                                    value={leadEdits.device_description ?? ""}
                                    onChange={(e) =>
                                        setLeadEdits((p) => ({
                                            ...p,
                                            device_description: e.target.value,
                                        }))
                                    }
                                    className={inputDark}
                                />
                            </div>
                        </div>
                    )}

                    {/* Call notes */}
                    <div>
                        <label className="block text-sm text-gray-400 mb-1">
                            Notatki z rozmowy
                        </label>
                        <textarea
                            value={callNotes}
                            onChange={(e) => setCallNotes(e.target.value)}
                            placeholder="Opcjonalne notatki..."
                            rows={3}
                            className="w-full bg-gray-800 border border-gray-600 rounded-xl px-4 py-3 text-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                        />
                    </div>

                    <div className="flex flex-col gap-3">
                        {foundData.type === "customer" && foundData.data?.id && (
                            <button
                                onClick={() => navigate(`/customers/${foundData.data.id}`)}
                                className={`${btnBase} bg-gray-700 hover:bg-gray-600 text-white`}
                            >
                                Otwórz profil klienta
                            </button>
                        )}
                        <button
                            onClick={handleMarkHandled}
                            className={`${btnBase} bg-green-600 hover:bg-green-500 text-white`}
                        >
                            Obsłużone ✓
                        </button>
                    </div>
                </div>
            )}

            {/* NOT FOUND VIEW */}
            {view === "notFound" && (
                <div className="flex-1 flex flex-col gap-6">
                    <div className="bg-gray-800 rounded-2xl px-6 py-4">
                        <div className="text-sm text-gray-400 mb-1">Nieznany numer</div>
                        <div className="text-2xl font-bold text-white">{foundData?.phone}</div>
                    </div>

                    <form onSubmit={handleCreateLead} className="flex flex-col gap-4">
                        <div>
                            <label className="block text-sm text-gray-400 mb-1">Imię</label>
                            <input
                                value={leadForm.first_name}
                                onChange={(e) =>
                                    setLeadForm((p) => ({ ...p, first_name: e.target.value }))
                                }
                                placeholder="Imię klienta"
                                className="w-full bg-gray-800 border border-gray-600 rounded-xl px-4 py-3 text-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                        </div>
                        <div>
                            <label className="block text-sm text-gray-400 mb-1">Nazwisko</label>
                            <input
                                value={leadForm.last_name}
                                onChange={(e) =>
                                    setLeadForm((p) => ({ ...p, last_name: e.target.value }))
                                }
                                placeholder="Nazwisko klienta"
                                className="w-full bg-gray-800 border border-gray-600 rounded-xl px-4 py-3 text-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                        </div>
                        <button
                            type="submit"
                            disabled={savingLead}
                            className={`${btnBase} bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50`}
                        >
                            {savingLead ? "Zapisuję..." : "Utwórz lead i obsłuż"}
                        </button>
                    </form>
                </div>
            )}
        </div>
    );
}
```

- [ ] **Krok 2: Commit**

```bash
git add frontend/src/pages/CarMode.jsx
git commit -m "fix: CarMode — active work items display, lead inline edit, fix raw-ID bug"
```

---

## Zadanie 5: Update `LeadBoard.jsx` — QuickLeadModal + przycisk Edytuj

**Pliki:**
- Modify: `frontend/src/pages/LeadBoard.jsx`

Zastępujemy wbudowany `LeadForm`+`Modal` przez `QuickLeadModal`. Dodajemy przycisk "Edytuj" per wiersz.

- [ ] **Krok 1: Zastąp całą zawartość `frontend/src/pages/LeadBoard.jsx`**

```jsx
import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { listLeads, updateLead, convertLead } from "../api/leads";
import QuickLeadModal from "../components/QuickLeadModal";

const STATUS_LABELS = {
    new: "Nowy",
    contacted: "Kontakt",
    converted: "Skonwertowany",
};

const STATUS_BADGE = {
    new: "bg-gray-100 text-gray-600",
    contacted: "bg-blue-100 text-blue-700",
    converted: "bg-green-100 text-green-700",
};

export default function LeadBoard() {
    const navigate = useNavigate();
    const [leads, setLeads] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [modal, setModal] = useState(null); // null | { mode: "create" } | { mode: "edit", lead: {...} }
    const [converting, setConverting] = useState(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError("");
        try {
            const data = await listLeads();
            setLeads(Array.isArray(data) ? data : data?.results || []);
        } catch (err) {
            setError(err.message || "Błąd ładowania leadów");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    function handleModalSave(saved) {
        if (modal?.mode === "edit") {
            setLeads((prev) => prev.map((l) => (l.id === saved.id ? saved : l)));
        } else {
            setLeads((prev) => [saved, ...prev]);
        }
        setModal(null);
    }

    async function handleStatusChange(id, status) {
        try {
            const updated = await updateLead(id, { status });
            setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, status: updated.status } : l)));
        } catch {
            alert("Błąd zmiany statusu.");
        }
    }

    async function handleConvert(id) {
        if (!window.confirm("Skonwertować lead do klienta?")) return;
        setConverting(id);
        try {
            const customer = await convertLead(id);
            setLeads((prev) =>
                prev.map((l) => (l.id === id ? { ...l, status: "converted" } : l))
            );
            navigate(`/customers/${customer.id}`);
        } catch (err) {
            const msg = err.response?.data?.detail || "Błąd konwersji.";
            alert(msg);
        } finally {
            setConverting(null);
        }
    }

    const formatDate = (iso) => {
        if (!iso) return "-";
        return new Date(iso).toLocaleDateString("pl-PL", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
        });
    };

    return (
        <>
            <div className="bg-white rounded-xl shadow-lg border border-gray-200">
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                    <div>
                        <h1 className="text-xl font-semibold text-gray-800">Leady</h1>
                        <p className="text-sm text-gray-500">Potencjalni klienci i zapytania</p>
                    </div>
                    <button
                        onClick={() => setModal({ mode: "create" })}
                        className="px-3 py-1.5 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700"
                    >
                        Nowy Lead
                    </button>
                </div>

                <div className="p-6">
                    {error && (
                        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                            {error}
                        </div>
                    )}

                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200 text-sm">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">#</th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Imię i Nazwisko</th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Telefon</th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Sprzęt</th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Status</th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Notatki</th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Data</th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Akcje</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-100">
                                {loading ? (
                                    <tr>
                                        <td colSpan={8} className="px-4 py-10 text-center text-sm text-gray-500">
                                            Ładowanie...
                                        </td>
                                    </tr>
                                ) : leads.length === 0 ? (
                                    <tr>
                                        <td colSpan={8} className="px-4 py-10 text-center text-sm text-gray-500">
                                            Brak leadów.
                                        </td>
                                    </tr>
                                ) : (
                                    leads.map((lead, idx) => (
                                        <tr key={lead.id} className="hover:bg-blue-50/50">
                                            <td className="px-4 py-3 text-sm text-gray-400">{idx + 1}</td>
                                            <td className="px-4 py-3 text-sm font-medium text-gray-900">
                                                {[lead.first_name, lead.last_name]
                                                    .filter(Boolean)
                                                    .join(" ") || "—"}
                                            </td>
                                            <td className="px-4 py-3 text-sm text-gray-700">
                                                {lead.prefix || ""}{lead.phone_number || "—"}
                                            </td>
                                            <td className="px-4 py-3 text-sm text-gray-700 max-w-xs truncate">
                                                {lead.device_description || "—"}
                                            </td>
                                            <td className="px-4 py-3 text-sm">
                                                <select
                                                    value={lead.status}
                                                    onChange={(e) =>
                                                        handleStatusChange(lead.id, e.target.value)
                                                    }
                                                    disabled={lead.status === "converted"}
                                                    className={`text-xs font-medium px-2 py-0.5 rounded-full border-0 cursor-pointer appearance-none ${
                                                        STATUS_BADGE[lead.status] || ""
                                                    }`}
                                                >
                                                    <option value="new">Nowy</option>
                                                    <option value="contacted">Kontakt</option>
                                                    <option value="converted" disabled>
                                                        Skonwertowany
                                                    </option>
                                                </select>
                                            </td>
                                            <td
                                                className="px-4 py-3 text-sm text-gray-500 max-w-[160px] truncate"
                                                title={lead.notes || ""}
                                            >
                                                {lead.notes || "—"}
                                            </td>
                                            <td className="px-4 py-3 text-sm text-gray-500">
                                                {formatDate(lead.created_at)}
                                            </td>
                                            <td className="px-4 py-3 text-sm">
                                                <div className="flex items-center gap-2">
                                                    {lead.status !== "converted" && (
                                                        <>
                                                            <button
                                                                onClick={() =>
                                                                    setModal({ mode: "edit", lead })
                                                                }
                                                                className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                                                            >
                                                                Edytuj
                                                            </button>
                                                            <button
                                                                onClick={() => handleConvert(lead.id)}
                                                                disabled={converting === lead.id}
                                                                className="px-2 py-1 text-xs font-medium bg-green-100 text-green-700 rounded-lg hover:bg-green-200 disabled:opacity-50"
                                                            >
                                                                {converting === lead.id
                                                                    ? "..."
                                                                    : "Konwertuj"}
                                                            </button>
                                                        </>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {modal && (
                <QuickLeadModal
                    mode={modal.mode}
                    initialData={modal.lead}
                    onClose={() => setModal(null)}
                    onSave={handleModalSave}
                />
            )}
        </>
    );
}
```

- [ ] **Krok 2: Commit**

```bash
git add frontend/src/pages/LeadBoard.jsx
git commit -m "feat: LeadBoard — edit button, replace inline form with QuickLeadModal"
```

---

## Zadanie 6: Update `AppLayout.jsx` — przycisk tworzenia leada w headerze

**Pliki:**
- Modify: `frontend/src/layouts/AppLayout.jsx`

Dodajemy przycisk `UserPlus` obok istniejącego `+` dla work itemów.

- [ ] **Krok 1: Zaktualizuj `frontend/src/layouts/AppLayout.jsx`**

Dodaj import `UserPlus` z lucide-react (linia 1):
```javascript
import { UserPlus } from "lucide-react";
```

Dodaj import `QuickLeadModal` (po importach z lucide):
```javascript
import QuickLeadModal from "../components/QuickLeadModal";
```

Dodaj stan `showLeadModal` w komponencie `AppLayout` (po linii `const [sidebarCollapsed, setSidebarCollapsed] = useState(false);`):
```javascript
const [showLeadModal, setShowLeadModal] = useState(false);
```

Zastąp blok przycisków w prawym rogu nawigacji (aktualnie linie 76–98):

**Przed zmianą:**
```jsx
<div className="flex items-center space-x-2 md:space-x-4">
    <button
        type="button"
        onClick={() => setMobileSearchOpen(true)}
        className="md:hidden p-2 text-gray-600 hover:text-blue-600"
        aria-label="Search"
    >
        <svg className="w-5 h-5" aria-hidden="true" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
    </button>

    <button
        type="button"
        onClick={() => navigate("/work-items/new")}
        aria-label="Create new work item"
        className="p-2 text-gray-600 hover:text-blue-600 border border-gray-200 rounded-lg hover:border-blue-200"
    >
        <svg className="w-5 h-5" aria-hidden="true" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
        </svg>
    </button>
    <UserProfileDropdown />
</div>
```

**Po zmianie:**
```jsx
<div className="flex items-center space-x-2 md:space-x-4">
    <button
        type="button"
        onClick={() => setMobileSearchOpen(true)}
        className="md:hidden p-2 text-gray-600 hover:text-blue-600"
        aria-label="Search"
    >
        <svg className="w-5 h-5" aria-hidden="true" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
    </button>

    <button
        type="button"
        onClick={() => setShowLeadModal(true)}
        aria-label="Utwórz nowy lead"
        title="Nowy lead"
        className="p-2 text-gray-600 hover:text-blue-600 border border-gray-200 rounded-lg hover:border-blue-200"
    >
        <UserPlus className="w-5 h-5" aria-hidden="true" />
    </button>

    <button
        type="button"
        onClick={() => navigate("/work-items/new")}
        aria-label="Create new work item"
        className="p-2 text-gray-600 hover:text-blue-600 border border-gray-200 rounded-lg hover:border-blue-200"
    >
        <svg className="w-5 h-5" aria-hidden="true" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
        </svg>
    </button>
    <UserProfileDropdown />
</div>
```

Dodaj render `QuickLeadModal` wewnątrz głównego `<div>` komponentu `AppLayout`, tuż przed zamknięciem `</div>` (po bloku mobile search overlay):

```jsx
{showLeadModal && (
    <QuickLeadModal
        mode="create"
        onClose={() => setShowLeadModal(false)}
        onSave={() => setShowLeadModal(false)}
    />
)}
```

- [ ] **Krok 2: Commit**

```bash
git add frontend/src/layouts/AppLayout.jsx
git commit -m "feat: AppLayout — add UserPlus button to create leads from anywhere"
```

---

## Weryfikacja końcowa

- [ ] **Uruchom wszystkie testy backendowe**

```bash
docker compose exec backend python manage.py test customers.tests calls.tests --verbosity=2
```

Oczekiwane: wszystkie testy zielone.

- [ ] **Uruchom frontend i sprawdź manualnie**

```bash
docker compose up -d
```

Sprawdź kolejno:
1. `/car` — kliknij na połączenie z istniejącym klientem → "Otwórz profil klienta" musi być widoczny
2. `/car` — kliknij na połączenie z istniejącym leadem → widoczne pola edycji (imię, nazwisko, sprzęt)
3. `/car` — dodaj notatkę i kliknij "Obsłużone ✓", sprawdź czy lead ma notatkę w `/leads`
4. `/leads` → kliknij "Edytuj" → formularz wypełniony danymi, po zapisie wiersz się aktualizuje
5. Header (każda strona) → kliknij `UserPlus` → modal "Nowy Lead" otwiera się, po zapisie zamyka się cicho
