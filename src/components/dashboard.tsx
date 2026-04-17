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
import { Loader2 } from "lucide-react";

type Payment = {
  id: string;
  order_id: string;
  transaction_id: string;
  amount: number;
  currency: string;
  status: "success" | "failed" | "pending";
  received_at: string;
};

export default function Dashboard() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<
    "all" | "success" | "failed" | "pending"
  >("all");
  const [searchTerm, setSearchTerm] = useState("");
  const fetchPayments = async (status: string) => {
    setLoading(true);
    try {
      const url =
        status === "all"
          ? "http://localhost:3000/api/payments"
          : `http://localhost:3000/api/payments/${status}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });

      if (!res.ok) {
        const text = await res.text();
        console.error("Erreur API:", text);
        setPayments([]);
        return;
      }

      const data = await res.json();
      setPayments(data.payments ?? []);
    } catch (err) {
      console.error("Erreur récupération paiements:", err);
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
      p.transaction_id.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  // if (loading)
  //   return (
  //     <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center">
  //       <Loader2 className="w-12 h-12 text-primary animate-spin" />
  //     </div>
  //   );

  return (
    <div className="container p-6 space-y-6 mx-auto">
      <div className="flex justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Mes paiements</h1>
          <p className="text-muted-foreground">
            Historique de vos transactions
          </p>
        </div>
      </div>
      <div className="flex gap-2 items-center">
        <Button
          size="sm"
          variant={filterStatus === "all" ? "default" : "outline"}
          onClick={() => setFilterStatus("all")}
          className="rounded-[8px]"
        >
          Tous
        </Button>
        <Button
          size="sm"
          variant={filterStatus === "success" ? "default" : "outline"}
          onClick={() => setFilterStatus("success")}
          className="text-white bg-success rounded-[8px]"
        >
          Validés
        </Button>
        <Button
          size="sm"
          variant={filterStatus === "failed" ? "destructive" : "outline"}
          onClick={() => setFilterStatus("failed")}
          className="bg-error text-white rounded-[8px]"
        >
          Échoués
        </Button>

        <Input
          placeholder="Rechercher..."
          className="ml-auto w-64"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Order Id</TableHead>
            <TableHead>Transaction ID</TableHead>
            <TableHead>Devise</TableHead>
            <TableHead>Montant</TableHead>
            <TableHead>Statut</TableHead>
            <TableHead>Date</TableHead>
            <TableHead>Action</TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          {filteredPayments.map((p) => (
            <PaymentRow
              key={p.id}
              orderId={p.order_id}
              transactionId={p.transaction_id}
              amount={`${p.amount} ${p.currency}`}
              currency={p.currency}
              status={
                p.status === "success"
                  ? "validé"
                  : p.status === "failed"
                    ? "échoué"
                    : "en attente"
              }
              date={new Date(p.received_at).toLocaleDateString()}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

type PaymentRowProps = {
  orderId: string;
  transactionId: string;
  amount: string;
  currency: string;
  status: "validé" | "échoué" | "en attente";
  date?: string;
};

function PaymentRow({
  orderId,
  transactionId,
  amount,
  currency,
  status,
  date,
}: PaymentRowProps) {
  return (
    <TableRow>
      <TableCell>{orderId}</TableCell>
      <TableCell>{transactionId}</TableCell>
      <TableCell>
        <Badge variant="outline">{currency}</Badge>
      </TableCell>
      <TableCell className="font-medium">{amount}</TableCell>
      <TableCell>
        <Badge
          variant={
            status === "validé"
              ? "default"
              : status === "échoué"
                ? "destructive"
                : "secondary"
          }
        >
          {status}
        </Badge>
      </TableCell>
      <TableCell>{date ?? "-"}</TableCell>
      <TableCell>
        <Button size="sm" variant="outline">
          Voir
        </Button>
      </TableCell>
    </TableRow>
  );
}
