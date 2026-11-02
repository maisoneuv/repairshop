/**
 * The right half of Settings → Work item process (§7D).
 *
 * Progressive disclosure: the 90% case — name, who does it, what to do, what to
 * capture — is always visible. Rewiring the branches and declaring when the
 * stage doesn't apply live under Advanced, because most shops set those once.
 */
import { useState } from "react";
import { ChevronDown, ChevronRight, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { updateStage } from "../../../api/processConfig";
import { errorText } from "./errors";
import CheckpointFieldsEditor from "./CheckpointFieldsEditor";
import OutcomesEditor from "./OutcomesEditor";
import SkipRulesEditor from "./SkipRulesEditor";

const OWNER_ROLES = [
    ["owner", "Customer service"],
    ["technician", "Technician"],
    ["any", "Anyone"],
];

const LABEL = "block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5";
const INPUT =
    "w-full text-sm border border-gray-200 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent";

export default function StageEditor({
    stage, stages, schema, customFields, onChanged, onDelete,
}) {
    const [advancedOpen, setAdvancedOpen] = useState(false);

    async function save(patch) {
        try {
            onChanged(await updateStage(stage.id, patch));
        } catch (err) {
            toast.error(errorText(err, "Couldn't save the stage."));
            throw err;
        }
    }

    return (
        <div className="space-y-6">
            <section className="bg-white border border-gray-200 rounded-lg p-5 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className={LABEL} htmlFor="stage-name">Name</label>
                        <BlurInput
                            id="stage-name"
                            value={stage.name}
                            onCommit={(name) => save({ name })}
                            className={INPUT}
                        />
                    </div>
                    <div>
                        <label className={LABEL} htmlFor="stage-owner">Who does it</label>
                        <select
                            id="stage-owner"
                            value={stage.owner_role}
                            onChange={(e) => save({ owner_role: e.target.value })}
                            className={INPUT}
                        >
                            {OWNER_ROLES.map(([value, label]) => (
                                <option key={value} value={value}>{label}</option>
                            ))}
                        </select>
                    </div>
                </div>
                <div>
                    <label className={LABEL} htmlFor="stage-guidance">Guidance</label>
                    <BlurInput
                        id="stage-guidance"
                        as="textarea"
                        rows={3}
                        value={stage.guidance}
                        placeholder="What the person on this stage should do."
                        onCommit={(guidance) => save({ guidance })}
                        className={INPUT}
                    />
                </div>
            </section>

            <section className="bg-white border border-gray-200 rounded-lg p-5">
                <h3 className="text-sm font-semibold text-gray-900 mb-1">Checkpoint fields</h3>
                <p className="text-xs text-gray-500 mb-4">
                    What this stage records before it can be finished. Add a field by picking
                    one that already exists — new fields are created on the Fields tab.
                </p>
                <CheckpointFieldsEditor
                    stage={stage}
                    schema={schema}
                    customFields={customFields}
                />
            </section>

            <section className="bg-white border border-gray-200 rounded-lg">
                <button
                    type="button"
                    onClick={() => setAdvancedOpen((v) => !v)}
                    className="w-full flex items-center gap-1.5 px-5 py-4 text-sm font-semibold text-gray-900"
                >
                    {advancedOpen
                        ? <ChevronDown className="w-4 h-4 text-gray-400" />
                        : <ChevronRight className="w-4 h-4 text-gray-400" />}
                    Advanced
                    <span className="font-normal text-xs text-gray-400 ml-1">
                        how you leave this stage, and when it's skipped
                    </span>
                </button>
                {advancedOpen && (
                    <div className="px-5 pb-5 space-y-6 border-t border-gray-100 pt-5">
                        <div>
                            <h4 className="text-sm font-semibold text-gray-900 mb-1">
                                When this stage is done, what can happen?
                            </h4>
                            <p className="text-xs text-gray-500 mb-4">
                                Each of these is a button on the checkpoint. Name the action,
                                not the destination — the app shows where it really goes.
                            </p>
                            <OutcomesEditor stage={stage} stages={stages} />
                        </div>
                        <div className="border-t border-gray-100 pt-5">
                            <h4 className="text-sm font-semibold text-gray-900 mb-1">
                                Skip this stage when…
                            </h4>
                            <p className="text-xs text-gray-500 mb-4">
                                Repairs matching any of these pass straight over this stage.
                                The reason shows on the repair's stage path, so anyone looking
                                later can see why it wasn't done.
                            </p>
                            <SkipRulesEditor
                                stage={stage}
                                schema={schema}
                                customFields={customFields}
                                onSave={(skip_when) => save({ skip_when })}
                            />
                        </div>
                    </div>
                )}
            </section>

            <div className="flex justify-end">
                <button
                    type="button"
                    onClick={onDelete}
                    className="inline-flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-md text-red-600 hover:bg-red-50"
                >
                    <Trash2 className="w-3.5 h-3.5" />
                    Delete stage
                </button>
            </div>
        </div>
    );
}

/**
 * Text that saves when you leave the box rather than on every keystroke —
 * these edits hit live repairs, so a PATCH per character is the wrong trade.
 */
function BlurInput({ value, onCommit, as = "input", className, ...rest }) {
    const [draft, setDraft] = useState(value ?? "");
    const Tag = as;

    return (
        <Tag
            {...rest}
            value={draft}
            className={className}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => {
                if (draft !== (value ?? "")) {
                    Promise.resolve(onCommit(draft)).catch(() => setDraft(value ?? ""));
                }
            }}
        />
    );
}
