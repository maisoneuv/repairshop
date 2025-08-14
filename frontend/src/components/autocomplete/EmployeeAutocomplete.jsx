import AutocompleteInput from '../AutocompleteInput';
import { buildSearchFn, getEmployeeSearchPath } from '../../api/autocompleteApi';

export default function EmployeeAutocomplete({
                                                 label = 'Employee',
                                                 value,
                                                 onSelect,
                                                 error,
                                                 required,
                                                 placeholder = 'Search employee...',
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
                searchFn={buildSearchFn(getEmployeeSearchPath)}
                displayField={(item) => `${item.name} (${item.email})`}
                placeholder={placeholder}
                error={error}
                {...props}
            />
        </div>
    );
}