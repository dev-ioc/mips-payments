"use client";
import { useEffect, useState } from "react";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type Payment = {
  id: string;
  order_id: string;
  transaction_id: string;
  amount: number;
  currency: string;
  status: "success" | "failed" | "pending";
  received_at: string;
  client_first_name: string;
  client_last_name: string;
  client_phone_number: string;
  fail_reason?: string;
};

export default function Dashboard() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<
    "all" | "success" | "failed" | "pending"
  >("all");
  const [searchTerm, setSearchTerm] = useState("");

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(1);

  const fetchPayments = async (status: string) => {
    setLoading(true);
    try {
      const url = `https://mips-wix-backend.onrender.com/api/payment?status=${status}`;

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });

      const data = await res.json();
      setPayments(data.payments ?? []);
    } catch (err) {
      console.error(err);
      setPayments([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchPayments(filterStatus);
  }, [filterStatus]);

  const filteredPayments = payments.filter(
    (p) =>
      p.order_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.transaction_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.status.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  const totalPages = Math.ceil(filteredPayments.length / pageSize);

  const paginatedPayments = filteredPayments.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );

  return (
    <div className="container p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Mes paiements</h1>

      <div className="flex items-center gap-3">
        <Button onClick={() => setFilterStatus("all")}>Tous</Button>
        <Button onClick={() => setFilterStatus("success")}>Succès</Button>
        <Button onClick={() => setFilterStatus("failed")}>Échoués</Button>

        <select
          className="border rounded px-2 py-1 ml-auto"
          value={pageSize}
          onChange={(e) => {
            setPageSize(Number(e.target.value));
            setCurrentPage(1);
          }}
        >
          <option value={1}>10</option>
          <option value={2}>25</option>
          <option value={50}>50</option>
          <option value={100}>100</option>
        </select>

        <Input
          placeholder="Rechercher..."
          className="w-64"
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            setCurrentPage(1);
          }}
        />
      </div>

      <Table className="table-fixed w-full">
        <TableHeader>
          <TableRow>
            <TableHead className="w-[120px]">Order Id</TableHead>
            <TableHead className="w-[180px]">Transaction</TableHead>
            <TableHead className="w-[80px]">Devise</TableHead>
            <TableHead className="w-[100px]">Montant</TableHead>
            <TableHead className="w-[100px]">Statut</TableHead>
            <TableHead className="w-[250px]">Raison</TableHead>
            <TableHead className="w-[120px]">Date</TableHead>
            <TableHead className="w-[120px]">Nom</TableHead>
            <TableHead className="w-[120px]">Prénom</TableHead>
            <TableHead className="w-[140px]">Téléphone</TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          {paginatedPayments.map((p) => (
            <TableRow key={p.id}>
              <TableCell className="truncate">{p.order_id}</TableCell>
              <TableCell className="truncate">{p.transaction_id}</TableCell>
              <TableCell>
                <Badge variant="outline">{p.currency}</Badge>
              </TableCell>
              <TableCell>{p.amount}</TableCell>
              <TableCell>
                <Badge>
                  {p.status === "success"
                    ? "Succès"
                    : p.status === "failed"
                      ? "Échoué"
                      : "En attente"}
                </Badge>
              </TableCell>
              <TableCell className="truncate">{p.fail_reason || "-"}</TableCell>
              <TableCell>
                {new Date(p.received_at).toLocaleDateString()}
              </TableCell>
              <TableCell>{p.client_first_name}</TableCell>
              <TableCell>{p.client_last_name}</TableCell>
              <TableCell>{p.client_phone_number}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <div className="flex justify-between items-center mt-4">
        <span>
          Page {currentPage} / {totalPages}
        </span>

        <div className="flex gap-2">
          <Button
            disabled={currentPage === 1}
            onClick={() => setCurrentPage((p) => p - 1)}
          >
            Précédent
          </Button>
          <Button
            disabled={currentPage === totalPages}
            onClick={() => setCurrentPage((p) => p + 1)}
          >
            Suivant
          </Button>
        </div>
      </div>
    </div>
  );
}
