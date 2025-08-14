import AutocompleteInput from '../AutocompleteInput';
import { buildSearchFn, getLocationSearchPath } from '../../api/autocompleteApi';

export default function LocationAutocomplete({
                                                 value,
                                                 onSelect,
                                                 error,
                                                 required,
                                                 placeholder = "Search location...",
                                                 ...props
                                             }) {
    return (
        <div>
            <label className="block font-medium mb-1">
                Drop-off Location
                {required && <span className="text-red-500 ml-1">*</span>}
            </label>
            <AutocompleteInput
                value={value}
                onSelect={onSelect}
                searchFn={buildSearchFn(getLocationSearchPath)}
                displayField={(item) => item.name}
                placeholder={placeholder}
                error={error}
                {...props}
            />
        </div>
    );
}