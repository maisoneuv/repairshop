# Inventory Management - User Guide

This guide covers how to manage your inventory: adding items, receiving deliveries, adjusting stock, and using parts in work items.

---

## Navigation

All inventory features are accessed from the **Inventory** page in the left sidebar.

From here you can:
- View all stock levels per location
- Filter by location or search by name/SKU/rack/shelf
- Add new items, adjust stock, or receive deliveries

---

## 1. Adding a New Inventory Item

Use this when you want to register a new part/consumable in your catalog.

**Steps:**
1. Go to **Inventory** page
2. Click the green **"New Item"** button in the top right
3. Fill in:
   - **Part name** (required) — e.g. "Resistor 10K 0603"
   - **SKU** — unique identifier for this part (e.g. "R-10K-0603")
   - **Type** — Part, Consumable, or Accessory
4. Optionally set initial stock:
   - Select a **Location** from the dropdown
   - Enter **Initial qty**
   - Enter **Rack** and **Shelf/Slot** (physical position)
5. Click **"Add Item"**

The item appears in the inventory table immediately.

**Possible errors:**
- `"sku": "inventory item with this tenant and sku already exists."` — A part with this SKU already exists. Use a different SKU or find the existing item.
- `"name": "This field is required."` — Part name cannot be empty.

---

## 2. Receiving a Delivery (Bulk Intake)

Use this when a shipment arrives and you need to add stock for many items at once.

### Step 1: Intake (SKU + Quantity)

1. Go to **Inventory** page
2. Click the purple **"Receive Delivery"** button
3. You see the **Intake Grid** — a fast-entry table with two columns: SKU and Qty

**How to enter items:**
- Type a **SKU** in the first row and press **Enter** or **Tab** — the cursor moves to the Qty field
- Type the **quantity** and press **Enter** — a new row is added automatically
- Continue entering SKU + Qty for all items in the delivery
- The system resolves each SKU in the background and shows the item name

**Keyboard shortcuts:**
| Key | Action |
|-----|--------|
| Enter/Tab on SKU field | Move to Qty field, resolve SKU |
| Enter/Tab on Qty field (last row) | Add new row, focus SKU |
| Enter/Tab on Qty field (not last) | Move to next row's SKU |

**If a SKU is not found:**
- You see **"SKU not found — Create new"**
- Click **"Create new"** to open an inline form
- Enter the **Item name** and select a **Type** (Part/Consumable/Accessory)
- Click **"Create"** or press **Enter** — the item is created and the row resolves

**Duplicate SKUs:** If you enter a SKU that already exists in another row, the quantities are merged automatically.

4. When all items are entered, click **"Continue to Storage Assignment"**
   - Only rows with a valid (resolved) SKU and quantity > 0 proceed

### Step 2: Storage Assignment

Here you assign each item to a physical location.

**Default location:**
- At the top, there is a **"Default location for all items"** dropdown
- If your user account is linked to a shop/location, this is pre-filled automatically
- Changing it applies to all items that don't have a manually-set location

**Per-item assignment:**
Each row shows:
| Column | Description |
|--------|-------------|
| Item | Part name and SKU |
| Qty | Quantity being received |
| Location | Dropdown to select which inventory list (required) |
| Rack | Physical rack identifier (e.g. "A", "B2") |
| Shelf | Shelf or slot within the rack (e.g. "3", "top") |
| Unit Cost | Cost per unit for this delivery (optional) |
| Suggestions | Quick-pick chips based on where this SKU was stored before |

**Suggestion chips:**
- Blue chips like **"Serwis Praga / A-3"** show historical storage locations for this specific SKU
- Click a chip to fill in Location, Rack, and Shelf instantly
- Suggestions are per-SKU only (they do NOT copy from other items)

**Bulk actions per category:**
- Items are grouped by category (e.g. "resistors", "capacitors")
- Each group has bulk dropdowns for Location, Rack, and Shelf
- Setting a bulk value applies it to all items in that category group

**Finalizing:**
1. Ensure every row has a **Location** selected (highlighted orange if missing)
2. Click the green **"Receive X Items"** button
3. On success, you see a summary: transactions created and balances updated
4. Click **"Back to Inventory"** to return, or **"Receive Another"** to start a new delivery

**Possible errors:**
- `Line 1 (R-10K-0603): SKU "R-10K-0603" not found.` — The item was deleted or SKU changed between steps. Go back and re-enter.
- `Line 3 (CAP-100N): inventory_list_id is required and must belong to tenant.` — No location was selected for this row.
- `Line 2 (FET-2N7000): Quantity must be positive.` — Quantity must be at least 1.
- `"No lines provided."` — The delivery was empty. Go back and add items.

---

## 3. Adjusting Stock

Use this for manual corrections — adding or removing stock without a delivery.

**Steps:**
1. Go to **Inventory** page
2. Click the blue **"Adjust Stock"** button
3. Fill in:
   - **Search part** (required) — start typing to search by name or SKU
   - **Select location** (required) — the inventory list to adjust
   - **Qty (+/-)** (required) — positive to add, negative to remove
   - **Rack** and **Shelf/Slot** (optional) — updates the physical position
4. Click **"Apply"**

**Examples:**
- Counted 5 extra units on the shelf? Enter `+5`
- Found 3 damaged units to discard? Enter `-3`
- Moving items to a different rack? Enter `0` qty with new rack/shelf values

**Possible errors:**
- `"inventory_item, inventory_list, and quantity are required."` — Fill in all required fields.
- `"Item not found."` — The selected part doesn't exist (may have been deleted).
- `"Location not found."` — The selected location doesn't exist.
- `"quantity must be an integer."` — Enter a whole number, not a decimal.

---

## 4. Using Parts in Work Items

When repairing a device, you can consume parts from inventory directly on the work item.

**Steps:**
1. Open a **Work Item** (e.g. from the Work Items list)
2. Go to the **Parts** tab
3. In the "Add Part" section:
   - Search for the part by name or SKU
   - Select the **Location** (only locations with available stock are shown)
   - The available quantity is displayed
   - Enter the **Qty** to consume
4. Click **"Add"**

The part appears in the consumed parts table with the date.

**Returning a part:**
- Click the **return button** next to a consumed part
- This creates a reverse transaction and adds the quantity back to stock

**Possible errors:**
- `"Insufficient stock. Available: 5"` — You're trying to consume more than what's in stock at that location.
- `"No stock found for this item at this location."` — There is no inventory balance for this part at the selected location.

---

## Testing Checklist

Use this checklist to verify the inventory features are working correctly.

### New Item
- [ ] Create a new item with name + SKU + type
- [ ] Verify it appears in the inventory table (with 0 qty if no initial stock)
- [ ] Try creating an item with a duplicate SKU — should show error
- [ ] Create an item with initial stock at a location — verify balance appears

### Receive Delivery
- [ ] Enter 3+ SKUs with quantities in the intake grid
- [ ] Verify each SKU resolves and shows the item name
- [ ] Enter a SKU that doesn't exist — verify "Create new" flow works
- [ ] Enter a duplicate SKU — verify quantities merge
- [ ] Press Enter through the grid — verify keyboard navigation works
- [ ] Continue to Step 2 — verify all items appear grouped by category
- [ ] Verify default location is pre-filled (if your account is linked to a location)
- [ ] Change the default location — verify all items update
- [ ] Click a suggestion chip — verify Location/Rack/Shelf fill in
- [ ] Use bulk actions to set location for a category group
- [ ] Override one item's location manually, then change global — verify the override is preserved
- [ ] Finalize the delivery — verify success message shows correct counts
- [ ] Go back to Inventory — verify stock levels increased

### Stock Adjustment
- [ ] Adjust stock up (+5) for a part at a location — verify balance increases
- [ ] Adjust stock down (-3) — verify balance decreases
- [ ] Adjust with rack/shelf — verify physical position updates
- [ ] Try adjusting for a non-existent item — should show error

### Work Item Parts
- [ ] Add a part to a work item — verify stock decreases
- [ ] Verify only locations with stock appear in the dropdown
- [ ] Try consuming more than available — should show insufficient stock error
- [ ] Return a consumed part — verify stock increases back

### General
- [ ] Verify location filter on inventory page works
- [ ] Verify search by name, SKU, rack, shelf works
- [ ] Verify sorting by clicking column headers works
- [ ] Verify all operations are tenant-scoped (data doesn't leak between tenants)
