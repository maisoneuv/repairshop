import { Link } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import { EditableValue } from "./InlineEdit";

/**
 * The Fields tab (§7A): every field on this work item, in one flat sectioned
 * list — the guaranteed home, so a tenant's custom field is never orphaned.
 *
 * Empty fields are shown rather than hidden, because the point of this view is
 * to be able to fill them in. Sections that don't apply (Billing on a warranty
 * repair) are dropped by the registry.
 */
export default function FieldsTab({ sections }) {
    return (
        <div className="space-y-4">
            <div>
                <h2 className="text-[15px] font-bold text-gray-900">All fields</h2>
                <p className="text-xs text-gray-500 mt-0.5 max-w-xl">
                    Every field on this work item, including your shop's custom fields.
                    Double-click a value (or hover for the pencil) to edit.
                </p>
            </div>

            {sections.map((section) => (
                <section key={section.title} className="bg-white rounded-xl border border-gray-200 p-4">
                    <div className="flex items-center justify-between gap-3 mb-1">
                        <h3 className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                            {section.title}
                        </h3>
                        {section.link?.to && (
                            <Link
                                to={section.link.to}
                                className="text-xs font-semibold text-blue-600 hover:text-blue-800 inline-flex items-center gap-0.5"
                            >
                                {section.link.label}
                                <ArrowUpRight className="w-3 h-3" />
                            </Link>
                        )}
                    </div>
                    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8">
                        {section.fields.map((field) => (
                            <div
                                key={field.key}
                                className="py-2 border-b border-gray-100 last:border-b-0 sm:[&:nth-last-child(2):nth-child(odd)]:border-b-0"
                            >
                                <dt className="text-[10px] font-bold uppercase tracking-wide text-gray-500 flex items-center gap-1.5">
                                    {field.label}
                                    {field.custom && (
                                        <span className="text-[8.5px] font-black tracking-wider text-blue-700 bg-blue-50 px-1.5 py-px rounded">
                                            CUSTOM
                                        </span>
                                    )}
                                </dt>
                                <dd className="mt-0.5 min-h-[22px]">
                                    <EditableValue
                                        fieldKey={field.key}
                                        value={field.value}
                                        type={field.type}
                                        choices={field.choices}
                                        config={field.config}
                                        readOnly={field.ro}
                                        readOnlyHint={field.roHint}
                                    />
                                </dd>
                            </div>
                        ))}
                    </dl>
                </section>
            ))}
        </div>
    );
}
