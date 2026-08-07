import RoleTicketsPage from "@/features/shared/RoleTicketsPage";

const TicketsPage = ({ onTicketSelect }: { onTicketSelect?: (ticketId: number) => void } = {}) => (
  <RoleTicketsPage role="admin" onTicketSelect={onTicketSelect} />
);

export default TicketsPage;
