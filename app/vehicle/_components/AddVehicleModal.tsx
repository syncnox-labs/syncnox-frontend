import VehicleForm from "./VehicleForm";
import { Modal } from "antd";

interface AddVehicleModalProps {
  open: boolean;
  setOpen: (value: boolean) => void;
}

const AddVehicleModal = ({ open, setOpen }: AddVehicleModalProps) => {
  return (
    <Modal
      footer={null}
      title="Add Vehicle"
      open={open}
      onCancel={() => setOpen(false)}
      width={600}
      centered
      destroyOnHidden
    >
      <VehicleForm onSubmit={() => setOpen(false)} />
    </Modal>
  );
};

export default AddVehicleModal;
