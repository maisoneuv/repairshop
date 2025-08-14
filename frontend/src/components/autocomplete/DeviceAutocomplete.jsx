import AutocompleteInput from '../AutocompleteInput';
import { buildSearchFn, buildDetailFn, getDeviceSearchPath } from '../../api/autocompleteApi';

export default function DeviceAutocomplete({
                                               label = 'Device',
                                               value,
                                               onSelect,
                                               onCreateNewClick,
                                               error,
                                               required,
                                               placeholder = 'Search device...',
                                               ...props
                                           }) {
    return (
        <div>
            <label className="block font-medium mb-1">
                {label}
                {required && <span className="text-red-500 ml-1">*</span>}
            </label>
            <AutocompleteInput
                value={value}
                onSelect={onSelect}
                searchFn={buildSearchFn(getDeviceSearchPath)}
                getDetailFn={buildDetailFn('inventory/api/devices')}
                displayField={(item) => {
                    const model = item.model || 'Unknown model';
                    const brand = item.manufacturer || 'Unknown manufacturer';
                    const category = item.category_name || 'Unknown category';
                    return `${model} (${brand} – ${category})`;
                }}
                onCreateNewClick={onCreateNewClick}
                placeholder={placeholder}
                error={error}
                {...props}
            />
        </div>
    );
}