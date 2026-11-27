import { useState, useEffect } from "react";
import {
  Form,
  Input,
  Select,
  TimePicker,
  Checkbox,
  Switch,
  Button,
  Radio,
} from "antd";
import { FormInstance } from "antd/es/form";
import { CopyOutlined } from "@ant-design/icons";
import { COUNTRY_CODES } from "@/constants/country";
import {
  phoneNumberPattern,
  createTimeWindowStartValidator,
  createTimeWindowEndValidator,
} from "@/utils/form.validation";
import { ROLE_TYPE_OPTIONS } from "./teamForm.constants";
import { useDepotStore } from "@/store/depots.store";
import AddressAutocomplete, {
  AddressData,
} from "@/components/AddressAutocomplete";
import { CustomFieldDefinition, getCustomFields } from "@/apis/custom-fields.api";
import { DynamicCustomFieldsForm } from "@/components/DynamicCustomFieldsForm";
import FormSection from "@/components/Settings/FormSection";
import { BriefcaseBusiness, Clock, Gauge, Hash, Mail, MapPinned, Phone, ShieldCheck, UserRound } from "lucide-react";
import { SteeringWheel } from "@phosphor-icons/react/ssr";

// Roles as choice buttons, each with a symbol people already associate with it
const ROLE_ICONS: Record<string, React.ComponentType<{ size?: number }>> = { admin: ShieldCheck, driver: (props) => <SteeringWheel weight="light" {...props} />, manager: BriefcaseBusiness };
const ROLE_CHOICES = ROLE_TYPE_OPTIONS.map((option) => {
  const Icon = ROLE_ICONS[option.value];
  return { value: option.value, label: <span className="inline-flex items-center gap-1.5">{Icon && <Icon size={15} />}{option.label}</span> };
});


const DAYS = [
  { key: "monday", label: "Monday" },
  { key: "tuesday", label: "Tuesday" },
  { key: "wednesday", label: "Wednesday" },
  { key: "thursday", label: "Thursday" },
  { key: "friday", label: "Friday" },
  { key: "saturday", label: "Saturday" },
  { key: "sunday", label: "Sunday" },
];

interface BasicInformationProps {
  form: FormInstance;
  scheduleBreak: boolean;
  onScheduleBreakChange: (checked: boolean) => void;
  isDriver: boolean;
  startLocationSameAsDepot: boolean;
  onStartLocationSameAsDepotChange: (checked: boolean) => void;
  endLocationSameAsDepot: boolean;
  onEndLocationSameAsDepotChange: (checked: boolean) => void;
  startDepotId?: number;
  setStartDepotId?: (id: number) => void;
  endDepotId?: number;
  setEndDepotId?: (id: number) => void;
}

const BasicInformation = ({
  form,
  scheduleBreak,
  onScheduleBreakChange,
  isDriver,
  startLocationSameAsDepot,
  onStartLocationSameAsDepotChange,
  endLocationSameAsDepot,
  onEndLocationSameAsDepotChange,
  startDepotId,
  setStartDepotId,
  endDepotId,
  setEndDepotId,
}: BasicInformationProps) => {
  const { depots } = useDepotStore();
  const [customFieldDefs, setCustomFieldDefs] = useState<CustomFieldDefinition[]>([]);
  const customFieldValues = form.getFieldValue("custom_fields") || {};
  const startAddress = Form.useWatch("start_address", form);
  const endAddress = Form.useWatch("end_address", form);

  useEffect(() => {
    getCustomFields("team_member")
      .then((defs) => setCustomFieldDefs(defs))
      .catch((err) => console.error("Failed to load team member custom fields", err));
  }, []);

  const depotOptions = depots.map((depot) => ({
    value: depot.id,
    label: depot.name,
  }));

  const copyMondayToAllDays = () => {
    const currentSchedules = form.getFieldValue("day_schedules") || {};
    const mon = currentSchedules.monday;
    if (!mon) return;
    const updated = { ...currentSchedules };
    ["tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"].forEach((day) => {
      updated[day] = {
        enabled: mon.enabled,
        start_time: mon.start_time,
        end_time: mon.end_time,
      };
    });
    form.setFieldsValue({ day_schedules: updated });
    form.submit();
  };

  // Where a driver's day starts or ends: one of the depots, or an address of their own
  const endpoint = (which: "start" | "end") => {
    const sameAsDepot = which === "start" ? startLocationSameAsDepot : endLocationSameAsDepot;
    const setSameAsDepot = which === "start" ? onStartLocationSameAsDepotChange : onEndLocationSameAsDepotChange;
    const depotId = which === "start" ? startDepotId : endDepotId;
    const setDepotId = which === "start" ? setStartDepotId : setEndDepotId;
    const address = which === "start" ? startAddress : endAddress;
    return (
      <Form.Item label={which === "start" ? "Start location" : "End location"}>
        <Radio.Group
          aria-label={`${which === "start" ? "Start" : "End"} location type`}
          className="!mb-2"
          value={sameAsDepot ? "depot" : "address"}
          onChange={(event) => setSameAsDepot(event.target.value === "depot")}
          options={[
            { value: "depot", label: "A depot" },
            { value: "address", label: "Another address" },
          ]}
        />
        {sameAsDepot ? (
          <Select
            placeholder="Select depot"
            options={depotOptions}
            value={depotId}
            onChange={(value) => setDepotId?.(value)}
            disabled={!setDepotId}
            getPopupContainer={() => document.body}
          />
        ) : (
          <Form.Item name={`${which}_address`} noStyle>
            <AddressAutocomplete
              value={address}
              placeholder="Type to search address"
              onChange={(value) => {
                form.setFieldsValue({ [`${which}_address`]: value || null, [`${which}_location`]: undefined });
              }}
              onSelect={(addressData: AddressData) => {
                form.setFieldsValue({ [`${which}_address`]: addressData.address_formatted, [`${which}_location`]: addressData.location });
              }}
            />
          </Form.Item>
        )}
      </Form.Item>
    );
  };

  return (
    <>
      <FormSection icon={UserRound} title="Profile" description="Who this person is and what they do in Syncnox.">
        <Form.Item label="Name" name="name" rules={[{ required: true, message: "Name is required" }]}>
          <Input />
        </Form.Item>
        <Form.Item label="Role" name="role_type" rules={[{ required: true, message: "Role type is required" }]}>
          <Radio.Group optionType="button" options={ROLE_CHOICES} />
        </Form.Item>
        <Form.Item label="External identifier" name="external_identifier" extra="The ID this person has in your own systems, if any.">
          <Input style={{ maxWidth: 250 }} prefix={<Hash size={14} className="text-[#626E67]" />} />
        </Form.Item>
      </FormSection>

      <FormSection icon={Phone} title="Contact" description="How dispatch reaches them.">
        <Form.Item label="Email" name="email" rules={[{ type: "email", message: "Please enter a valid email" }]}>
          <Input type="email" prefix={<Mail size={14} className="text-[#626E67]" />} />
        </Form.Item>
        <Form.Item label="Phone number">
          <div className="grid grid-cols-[150px_minmax(0,1fr)] gap-2">
            <Form.Item name={["phone", "countryCode"]} noStyle initialValue={`🇺🇸 +1`}>
              <Select showSearch optionFilterProp="children" className="w-full" getPopupContainer={() => document.body}>
                {COUNTRY_CODES.map((item) => (
                  <Select.Option key={item.code} value={`${item.flag} ${item.code}`}>
                    {item.flag} {item.code} &nbsp; {item.name}
                  </Select.Option>
                ))}
              </Select>
            </Form.Item>
            <Form.Item name={["phone", "number"]} noStyle rules={[phoneNumberPattern]} normalize={(value) => String(value ?? "").replace(/\D/g, "")}>
              <Input type="tel" inputMode="tel" autoComplete="tel-national" aria-label="Phone number" maxLength={15} prefix={<Phone size={14} className="text-[#626E67]" />} />
            </Form.Item>
          </div>
        </Form.Item>
      </FormSection>

      {isDriver && (
        <FormSection icon={MapPinned} title="Start and end of day" description="Where this driver's routes begin and finish.">
          {endpoint("start")}
          {endpoint("end")}
        </FormSection>
      )}

      {/* Hidden location fields for start */}
      <Form.Item name={["start_location", "lat"]} hidden>
        <Input />
      </Form.Item>
      <Form.Item name={["start_location", "lng"]} hidden>
        <Input />
      </Form.Item>

      {/* Hidden location fields for end */}
      <Form.Item name={["end_location", "lat"]} hidden>
        <Input />
      </Form.Item>
      <Form.Item name={["end_location", "lng"]} hidden>
        <Input />
      </Form.Item>

      {/* Driver-specific fields - only show for drivers */}
      {isDriver && (
        <>
          <FormSection icon={Clock} title="Working hours" description="The days and hours this driver can be given work.">
            <div className="border border-[#D5DCD8]">
              {DAYS.map((day) => (
                <Form.Item noStyle key={day.key} shouldUpdate>
                  {() => {
                    const schedule = form.getFieldValue(["day_schedules", day.key]) || {};
                    const isEnabled = schedule.enabled !== false;

                    return (
                      <div className="flex min-h-11 flex-wrap items-center gap-x-4 gap-y-1 border-b border-[#E3E8E5] px-3 py-1.5 last:border-b-0">
                        <label className="flex w-32 shrink-0 cursor-pointer items-center gap-2.5">
                          <Form.Item
                            name={["day_schedules", day.key, "enabled"]}
                            // A day with no saved value counts as working, so the switch shows on without
                            // overwriting the form's own initial values (which caused a warning per day).
                            getValueProps={(value) => ({ checked: value !== false })}
                            valuePropName="checked"
                            noStyle
                          >
                            <Switch size="small" />
                          </Form.Item>
                          <span className={`text-[13px] ${isEnabled ? "font-medium text-[#12211A]" : "text-[#626E67]"}`}>{day.label}</span>
                        </label>
                        {isEnabled ? (
                          <div className="flex items-center gap-2">
                            <Form.Item name={["day_schedules", day.key, "start_time"]} noStyle>
                              <TimePicker
                                needConfirm={false}
                                size="small"
                                format="HH:mm"
                                placeholder="Start"
                                aria-label={`${day.label} work starts`}
                                style={{ width: 104 }}
                                getPopupContainer={() => document.body}
                              />
                            </Form.Item>
                            <span className="text-xs text-[#626E67]">to</span>
                            <Form.Item name={["day_schedules", day.key, "end_time"]} noStyle>
                              <TimePicker
                                needConfirm={false}
                                size="small"
                                format="HH:mm"
                                placeholder="End"
                                aria-label={`${day.label} work ends`}
                                style={{ width: 104 }}
                                getPopupContainer={() => document.body}
                              />
                            </Form.Item>
                          </div>
                        ) : (
                          <span className="text-xs text-[#626E67]">Not working</span>
                        )}
                      </div>
                    );
                  }}
                </Form.Item>
              ))}
            </div>
            <Button type="link" size="small" icon={<CopyOutlined />} onClick={copyMondayToAllDays} style={{ padding: 0, fontSize: 12, marginTop: 8 }}>
              Copy Mon to All Days
            </Button>
          </FormSection>

          <FormSection icon={Gauge} title="Limits and breaks" description="Caps the optimizer respects when it plans this driver's day.">
            <Form.Item label="Distance limit" name="max_distance" extra="The most this driver may travel in a day.">
              <Input type="number" style={{ maxWidth: 180 }} min={0} addonAfter="km" />
            </Form.Item>
            <Form.Item name="allowed_overtime" valuePropName="checked" className="!mb-2">
              <Checkbox>Allowed Overtime</Checkbox>
            </Form.Item>
            <Form.Item className={scheduleBreak ? "!mb-3" : ""}>
              <Checkbox checked={scheduleBreak} onChange={(e) => onScheduleBreakChange(e.target.checked)}>
                Schedule a break for this driver
              </Checkbox>
            </Form.Item>
            {scheduleBreak && (
              <Form.Item label="Break must happen between">
                <div className="flex items-center gap-2">
                  <Form.Item
                    name="break_time_start"
                    noStyle
                    rules={[createTimeWindowStartValidator(form, "break_time_end", "Break start time", "Break end time")]}
                  >
                    <TimePicker
                      needConfirm={false}
                      format="HH:mm"
                      placeholder="Start"
                      style={{ width: 120 }}
                      getPopupContainer={() => document.body}
                      onChange={() => {
                        form.validateFields(["break_time_end"]);
                      }}
                    />
                  </Form.Item>
                  <span className="text-xs text-[#626E67]">and</span>
                  <Form.Item
                    name="break_time_end"
                    noStyle
                    rules={[createTimeWindowEndValidator(form, "break_time_start", "Break start time", "Break end time")]}
                  >
                    <TimePicker
                      needConfirm={false}
                      format="HH:mm"
                      placeholder="End"
                      style={{ width: 120 }}
                      getPopupContainer={() => document.body}
                      onChange={() => {
                        form.validateFields(["break_time_start"]);
                      }}
                    />
                  </Form.Item>
                </div>
              </Form.Item>
            )}
          </FormSection>
        </>
      )}

      {customFieldDefs.length > 0 && <div className="border-t border-[#D5DCD8] pt-6" />}
      <DynamicCustomFieldsForm
        customFields={customFieldDefs}
        values={customFieldValues}
        onChange={(updated) => form.setFieldsValue({ custom_fields: updated })}
      />
    </>
  );
};

export default BasicInformation;
