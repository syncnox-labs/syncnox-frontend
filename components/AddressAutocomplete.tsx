import { useEffect, useRef, useState } from "react";
import { AutoComplete } from "antd";
import { useGooglePlaces } from "@/hooks/useGooglePlaces";

export interface AddressData {
  location: {
    lat: number;
    lng: number;
  };
  address_formatted: string;
  city?: string;
  country?: string;
}

interface AddressAutocompleteProps {
  value?: string | null;
  onChange?: (value: string) => void;
  onSelect?: (addressData: AddressData) => void;
  placeholder?: string;
  predefinedOptions?: {
    label: string;
    addressData: AddressData;
  }[];
}

interface PredictionOption {
  value: string;
  label: React.ReactNode;
  _placeId?: string;
  _addressData?: AddressData;
}

/**
 * Reusable Google Places Autocomplete component
 * Provides address search with location data extraction
 */
const AddressAutocomplete: React.FC<AddressAutocompleteProps> = ({
  value,
  onChange,
  onSelect,
  placeholder = "Type to search address",
  predefinedOptions = [],
}) => {
  const { isLoaded, error } = useGooglePlaces();
  const [options, setOptions] = useState<PredictionOption[]>([]);
  const [searchValue, setSearchValue] = useState(value || "");
  const [confirmedValue, setConfirmedValue] = useState(value || "");
  // Track whether the input is currently focused so that external value
  // prop changes (e.g. from a parent re-render after onChange) do NOT
  // overwrite what the user is actively typing.
  const isFocusedRef = useRef(false);
  const autocompleteService =
    useRef<google.maps.places.AutocompleteService | null>(null);
  const placesService = useRef<google.maps.places.PlacesService | null>(null);
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);

  // Initialize services when Google Maps is loaded
  useEffect(() => {
    if (isLoaded && window.google?.maps?.places) {
      autocompleteService.current =
        new google.maps.places.AutocompleteService();

      // PlacesService requires a DOM element, create a hidden div
      const div = document.createElement("div");
      placesService.current = new google.maps.places.PlacesService(div);
    }
  }, [isLoaded]);

  // Sync searchValue with external value prop ONLY when the input is NOT focused.
  // When the user is actively typing we own the state; parent re-renders triggered
  // by onChange callbacks must not overwrite the current input text.
  useEffect(() => {
    if (!isFocusedRef.current) {
      const externalValue = value || "";
      if (externalValue !== searchValue) {
        setSearchValue(externalValue);
      }
      if (externalValue !== confirmedValue) {
        setConfirmedValue(externalValue);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
    };
  }, []);

  // Handle search input with debouncing
  const handleSearch = (searchText: string) => {
    setSearchValue(searchText);
    onChange?.(searchText);

    // Filter predefined options
    const matchingPredefined = predefinedOptions
      .filter((opt) =>
        !searchText ||
        opt.label.toLowerCase().includes(searchText.toLowerCase()) ||
        opt.addressData.address_formatted.toLowerCase().includes(searchText.toLowerCase())
      )
      .map((opt, index) => ({
        value: `predefined_${index}_${opt.label}`,
        label: (
          <div className="flex flex-col">
            <span className="font-semibold text-gray-800">{opt.label}</span>
            <span className="text-xs text-gray-500">{opt.addressData.address_formatted}</span>
          </div>
        ),
        _addressData: opt.addressData,
      }));

    // Clear previous debounce timer
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }

    if (!searchText || !autocompleteService.current) {
      setOptions(matchingPredefined);
      return;
    }

    // Set new debounce timer (200ms delay)
    debounceTimer.current = setTimeout(() => {
      autocompleteService.current!.getPlacePredictions(
        { input: searchText },
        (predictions, status) => {
          if (status === google.maps.places.PlacesServiceStatus.OK && predictions) {
            const googleOptions = predictions.map((prediction) => ({
              value: prediction.place_id,
              label: (
                <div className="flex flex-col">
                  <span>{prediction.structured_formatting?.main_text || prediction.description}</span>
                  <span className="text-xs text-gray-500">
                    {prediction.structured_formatting?.secondary_text || ""}
                  </span>
                </div>
              ),
              _placeId: prediction.place_id,
            }));
            setOptions([...matchingPredefined, ...googleOptions]);
          } else {
            setOptions(matchingPredefined);
          }
        }
      );
    }, 200);
  };

  // Handle address selection
  const handleSelectAddress = (selectedValue: string) => {
    const selectedOption = options.find((opt) => opt.value === selectedValue);

    if (!selectedOption) {
      return;
    }

    isFocusedRef.current = false;

    if (selectedOption._addressData) {
      setSearchValue(selectedOption._addressData.address_formatted);
      setConfirmedValue(selectedOption._addressData.address_formatted);
      onChange?.(selectedOption._addressData.address_formatted);
      onSelect?.(selectedOption._addressData);
      return;
    }

    if (!placesService.current || !selectedOption._placeId) {
      return;
    }

    // Get place details to extract coordinates
    placesService.current.getDetails(
      {
        placeId: selectedOption._placeId,
        fields: ["geometry", "formatted_address", "address_components"],
      },
      (place, status) => {
        if (status === google.maps.places.PlacesServiceStatus.OK && place) {
          const lat = place.geometry?.location?.lat();
          const lng = place.geometry?.location?.lng();
          const formattedAddress = place.formatted_address;

          let city = "";
          let country = "";
          if (place.address_components) {
            for (const component of place.address_components) {
              if (component.types.includes("locality")) {
                city = component.long_name;
              }
              if (component.types.includes("country")) {
                country = component.long_name;
              }
            }
          }

          if (lat !== undefined && lng !== undefined && formattedAddress) {
            const addressData: AddressData = {
              location: {
                lat,
                lng,
              },
              address_formatted: formattedAddress,
              city: city || undefined,
              country: country || undefined,
            };

            // Update internal state to reflect the selected address
            setSearchValue(formattedAddress);
            setConfirmedValue(formattedAddress);
            // setIsTypingNew(false);
            onChange?.(formattedAddress);
            onSelect?.(addressData);
          }
        }
      }
    );
  };

  // Handle blur - revert to confirmed value if no selection was made
  const handleBlur = () => {
    isFocusedRef.current = false;
    if (searchValue !== confirmedValue && !options.length) {
      // User typed but didn't select - revert to confirmed value
      setSearchValue(confirmedValue);
      onChange?.(confirmedValue);
      setOptions([]);
    }
  };

  const handleFocus = () => {
    isFocusedRef.current = true;
    if (!searchValue) {
      handleSearch("");
    }
  };

  if (error) {
    console.error("Google Places API error:", error);
  }

  return (
    <AutoComplete
      style={{ width: "100%" }}
      value={searchValue}
      options={options.map(opt => ({ value: opt.value, label: opt.label }))}
      onSearch={handleSearch}
      onSelect={handleSelectAddress}
      onFocus={handleFocus}
      onBlur={handleBlur}
      placeholder={isLoaded ? placeholder : "Loading Google Maps..."}
      disabled={!!error}
      notFoundContent={isLoaded ? "No addresses found" : "Loading..."}
      getPopupContainer={() => document.body}
    />
  );
};

export default AddressAutocomplete;
