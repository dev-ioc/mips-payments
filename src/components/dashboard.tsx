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
  const [pageSize, setPageSize] = useState(10);

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
    <div className="flex w-full p-6 space-y-6 h-screen">
      <h1 className="text-2xl font-semibold">Mes paiements</h1>

      <div className="flex items-center gap-3">
        <Button
          onClick={() => setFilterStatus("all")}
          variant={filterStatus === "all" ? "default" : "outline"}
          className={filterStatus === "all" ? "bg-primary text-white" : ""}
        >
          Tous
        </Button>
        <Button
          onClick={() => setFilterStatus("success")}
          variant={filterStatus === "success" ? "default" : "outline"}
          className={
            filterStatus === "success"
              ? "bg-green-600 text-white hover:bg-green-700"
              : "border-green-600 text-green-600 hover:bg-green-50"
          }
        >
          Succès
        </Button>
        <Button
          onClick={() => setFilterStatus("failed")}
          variant={filterStatus === "failed" ? "default" : "outline"}
          className={
            filterStatus === "failed"
              ? "bg-red-600 text-white hover:bg-red-700"
              : "border-red-600 text-red-600 hover:bg-red-50"
          }
        >
          Échoués
        </Button>

        <select
          className="border rounded px-2 py-1 ml-auto"
          value={pageSize}
          onChange={(e) => {
            setPageSize(Number(e.target.value));
            setCurrentPage(1);
          }}
        >
          <option value={10}>10</option>
          <option value={25}>25</option>
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

      <div className="border rounded-lg overflow-x-auto mx-w-[100%]">
        <Table className="w-full">
          <TableHeader>
            <TableRow>
              <TableHead className="w-[120px]">Order Id</TableHead>
              <TableHead className="w-[180px]">Transaction</TableHead>
              <TableHead className="w-[80px]">Devise</TableHead>
              <TableHead className="w-[100px]">Montant</TableHead>
              <TableHead className="w-[100px]">Statut</TableHead>
              <TableHead className="min-w-[300px]">Raison de l'échec</TableHead>
              <TableHead className="w-[120px]">Date</TableHead>
              <TableHead className="w-[120px]">Nom</TableHead>
              <TableHead className="w-[120px]">Prénom</TableHead>
              <TableHead className="w-[140px]">Téléphone</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={10} className="text-center py-8">
                  Chargement...
                </TableCell>
              </TableRow>
            ) : paginatedPayments.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="text-center py-8">
                  Aucun paiement trouvé
                </TableCell>
              </TableRow>
            ) : (
              paginatedPayments.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="align-top">
                    <span className="block max-w-[110px] break-words">
                      {p.order_id}
                    </span>
                  </TableCell>
                  <TableCell className="align-top">
                    <span className="block max-w-[170px] break-words">
                      {p.transaction_id}
                    </span>
                  </TableCell>
                  <TableCell className="align-top">
                    <Badge variant="outline">{p.currency}</Badge>
                  </TableCell>
                  <TableCell className="align-top font-medium">
                    {p.amount.toFixed(2)}
                  </TableCell>
                  <TableCell className="align-top">
                    <Badge
                      variant={
                        p.status === "success"
                          ? "default"
                          : p.status === "failed"
                            ? "destructive"
                            : "secondary"
                      }
                    >
                      {p.status === "success"
                        ? "Succès"
                        : p.status === "failed"
                          ? "Échoué"
                          : "En attente"}
                    </Badge>
                  </TableCell>
                  <TableCell className="align-top">
                    <div className="max-w-[280px] whitespace-normal break-words">
                      {p.fail_reason ? (
                        <span className="text-red-600 text-sm">
                          {p.fail_reason}
                        </span>
                      ) : (
                        "-"
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="align-top whitespace-nowrap">
                    {new Date(p.received_at).toLocaleDateString("fr-FR")}
                  </TableCell>
                  <TableCell className="align-top">
                    <span className="block max-w-[110px] break-words">
                      {p.client_first_name}
                    </span>
                  </TableCell>
                  <TableCell className="align-top">
                    <span className="block max-w-[110px] break-words">
                      {p.client_last_name}
                    </span>
                  </TableCell>
                  <TableCell className="align-top">
                    <span className="block max-w-[130px] break-words">
                      {p.client_phone_number}
                    </span>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex justify-between items-center mt-4">
        <span className="text-sm text-gray-600">
          Page {currentPage} / {totalPages}
        </span>

        <div className="flex gap-2">
          <Button
            variant="outline"
            disabled={currentPage === 1}
            onClick={() => setCurrentPage((p) => p - 1)}
          >
            ← Précédent
          </Button>
          <Button
            variant="outline"
            disabled={currentPage === totalPages}
            onClick={() => setCurrentPage((p) => p + 1)}
          >
            Suivant →
          </Button>
        </div>
      </div>
    </div>
  );
}
