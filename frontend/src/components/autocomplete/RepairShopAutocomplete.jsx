import AutocompleteInput from '../AutocompleteInput';
import { buildSearchFn, getShopSearchPath } from '../../api/autocompleteApi';

export default function RepairShopAutocomplete({
    value,
    onSelect,
    error,
    required,
    label = "Fulfillment Shop",
    placeholder = "Search repair shop...",
    showLabel = true,
    ...props
}) {
    return (
        <div>
            {showLabel && (
                <label className="block text-sm font-medium text-gray-700 mb-2">
                    {label}
                    {required && <span className="text-red-500 ml-1">*</span>}
                </label>
            )}
            <AutocompleteInput
                value={value}
                onSelect={onSelect}
                searchFn={buildSearchFn(getShopSearchPath)}
                displayField={(item) => item.name}
                placeholder={placeholder}
                error={error}
                {...props}
            />
        </div>
    );
}
