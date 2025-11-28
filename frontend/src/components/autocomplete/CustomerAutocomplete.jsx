import AutocompleteInput from '../AutocompleteInput';
import { buildSearchFn, buildDetailFn, getCustomerSearchPath } from '../../api/autocompleteApi';

export default function CustomerAutocomplete({
                                                 value,
                                                 onSelect,
                                                 error,
                                                 displayField,
                                                 onCreateNewClick,
                                                 required,
                                                 placeholder = "Search customer...",
                                                 ...props
                                             }) {
    return (
        <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
                Customer
                {required && <span className="text-red-500 ml-1">*</span>}
            </label>

            <AutocompleteInput
                value={value}
                onSelect={onSelect}
                searchFn={buildSearchFn(getCustomerSearchPath)}
                getDetailFn={buildDetailFn('api/customers/api/customers')}
                displayField={displayField}
                onCreateNewClick={onCreateNewClick}
                placeholder={placeholder}
                error={error}
                {...props}
            />
        </div>
    );
}
