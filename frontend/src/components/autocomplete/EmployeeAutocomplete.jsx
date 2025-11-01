import AutocompleteInput from '../AutocompleteInput';
import { buildSearchFn, buildFetchAllFn, getEmployeeSearchPath, getEmployeeListPath } from '../../api/autocompleteApi';

export default function EmployeeAutocomplete({
                                                 label = 'Employee',
                                                 value,
                                                 onSelect,
                                                 error,
                                                 required,
                                                 placeholder = 'Search employee...',
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
                searchFn={buildSearchFn(getEmployeeSearchPath)}
                fetchAllFn={buildFetchAllFn(getEmployeeListPath)}
                displayField={(item) => `${item.name} (${item.email})`}
                placeholder={placeholder}
                error={error}
                {...props}
            />
        </div>
    );
}
