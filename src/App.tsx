/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Plus, 
  Trash2, 
  ShoppingBag, 
  CreditCard, 
  DollarSign, 
  Calendar,
  ChevronRight,
  Package,
  ArrowRightLeft,
  BarChart3,
  Search,
  ChevronLeft,
  Download,
  TrendingUp,
  PieChart,
  Settings,
  Database,
  Share2,
  MoreVertical,
  FileText,
  FileSpreadsheet,
  X,
  Eye,
  Lock,
  User,
  Clock,
  Tag,
  MessageCircle,
  Mail,
  MoreHorizontal,
  CheckCircle,
  AlertCircle,
  Info
} from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { 
  startOfDay, 
  endOfDay, 
  startOfMonth, 
  endOfMonth, 
  isWithinInterval, 
  format, 
  subDays, 
  eachDayOfInterval,
  isSameDay,
  startOfWeek,
  startOfYear,
  getDaysInMonth,
  setMonth,
  setYear,
  eachMonthOfInterval,
  endOfYear
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  ResponsiveContainer, 
  Cell 
} from 'recharts';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { db } from './db';
import { Sale, SaleItem, PaymentType, PAYMENT_LABELS } from './types';
import { cn } from './lib/utils';

type View = 'sales' | 'reports' | 'settings';

// Colors
const COLOR_WINE = '#6B0D0D';
const COLOR_BLACK = '#000000';

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState(false);
  const [currentView, setCurrentView] = useState<View>('sales');
  const sales = useLiveQuery(() => db.sales.orderBy('timestamp').reverse().toArray()) || [];
  
  // Sales Registration State
  const [productType, setProductType] = useState('');
  const [quantity, setQuantity] = useState<number>(1);
  const [unitPrice, setUnitPrice] = useState<number>(0);
  const [paymentType, setPaymentType] = useState<PaymentType>('dinheiro');
  const [installments, setInstallments] = useState<number>(1);
  const [customerName, setCustomerName] = useState('Cliente Delicata');
  const [discount, setDiscount] = useState<number>(0);
  const [currentItems, setCurrentItems] = useState<SaleItem[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [lastBackupDate, setLastBackupDate] = useState<string | null>(localStorage.getItem('delicata_last_backup'));
  const [isGDriveAuthenticated, setIsGDriveAuthenticated] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [showRestoreMenu, setShowRestoreMenu] = useState(false);
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<number | null>(null);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showExportOptions, setShowExportOptions] = useState(false);
  const [exportPeriod, setExportPeriod] = useState<'MENSAL' | 'ANUAL'>('MENSAL');
  const [exportMonth, setExportMonth] = useState(new Date().getMonth());
  const [exportYear, setExportYear] = useState(new Date().getFullYear());
  const [exportFormat, setExportFormat] = useState<'PDF' | 'Excel'>('PDF');
  const [showGDriveConfirm, setShowGDriveConfirm] = useState(false);
  const [showShareMenu, setShowShareMenu] = useState(false);
  const [showReportPreview, setShowReportPreview] = useState(false);
  const [showSaleDetail, setShowSaleDetail] = useState(false);
  const [saleToView, setSaleToView] = useState<Sale | null>(null);
  const [reportPreviewData, setReportPreviewData] = useState<{
    headers: string[],
    rows: any[],
    title: string,
    period: string,
    totals: any
  } | null>(null);

  const handleLogin = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (password === 'Sonia') {
      setIsAuthenticated(true);
      setAuthError(false);
    } else {
      setAuthError(true);
      setTimeout(() => setAuthError(false), 2000);
    }
  };

  useEffect(() => {
    const checkGDriveStatus = async () => {
      try {
        const response = await fetch('/api/auth/status');
        const data = await response.json();
        setIsGDriveAuthenticated(data.isAuthenticated);
      } catch (error) {
        console.error("Error checking GDrive status:", error);
      }
    };
    checkGDriveStatus();

    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
        setIsGDriveAuthenticated(true);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const connectGDrive = async () => {
    try {
      const response = await fetch('/api/auth/google/url');
      const { url } = await response.json();
      window.open(url, 'google_oauth_popup', 'width=600,height=700');
    } catch (error) {
      console.error("Error getting auth URL:", error);
    }
  };

  const uploadToGDrive = async (fileName: string, content: string) => {
    try {
      setIsUploading(true);
      const response = await fetch('/api/drive/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName, content })
      });
      const data = await response.json();
      setIsUploading(false);
      return data.success;
    } catch (error) {
      console.error("Error uploading to GDrive:", error);
      setIsUploading(false);
      return false;
    }
  };

  const handleWeeklyGDriveBackup = async () => {
    if (!isGDriveAuthenticated) return;

    const now = new Date();
    const startOfW = startOfWeek(now, { weekStartsOn: 1 }); // Monday
    const backups = await db.backups
      .where('timestamp')
      .between(startOfW.getTime(), now.getTime(), true, true)
      .toArray();

    if (backups.length === 0) return;

    const content = JSON.stringify(backups, null, 2);
    const fileName = `delicata_weekly_backup_${format(now, 'yyyy-MM-dd')}.json`;
    const success = await uploadToGDrive(fileName, content);
    if (success) {
      showToast('Backup semanal enviado com sucesso para o Google Drive!', 'success');
    } else {
      showToast('Erro ao enviar backup semanal para o Google Drive.', 'error');
    }
  };

  const handleManualGDriveBackup = async () => {
    if (!isGDriveAuthenticated) {
      setShowGDriveConfirm(true);
      return;
    }

    const data = JSON.stringify(sales, null, 2);
    const now = new Date();
    const fileName = `delicata_manual_backup_${format(now, 'yyyy-MM-dd_HHmm')}.json`;
    const success = await uploadToGDrive(fileName, data);
    if (success) {
      showToast('Backup manual enviado com sucesso para o Google Drive!', 'success');
    } else {
      showToast('Erro ao enviar backup manual para o Google Drive.', 'error');
    }
  };

  const handleShareBackup = async (app?: string) => {
    setIsExporting(true);
    try {
      const data = JSON.stringify(sales, null, 2);
      const now = new Date();
      const fileName = `delicata_backup_${format(now, 'yyyy-MM-dd_HHmm')}.json`;
      const blob = new Blob([data], { type: 'application/json' });
      const file = new File([blob], fileName, { type: 'application/json' });

      const success = await saveOrShareFile(file, blob, fileName);
      if (success) {
        showToast('Backup compartilhado com sucesso!', 'success');
        setShowShareMenu(false);
      } else {
        showToast('Erro ao compartilhar backup.', 'error');
      }
    } catch (error) {
      console.error("Share backup error:", error);
      showToast('Erro ao processar compartilhamento.', 'error');
    } finally {
      setIsExporting(false);
    }
  };

  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const saveOrShareFile = async (file: File, blob: Blob, fileName: string) => {
    const isInIframe = window.self !== window.top;
    
    // Sanitize filename: remove accents, spaces and special characters
    const sanitizedName = fileName
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, '_')
      .replace(/[^a-z0-9.-]/gi, '_');

    // 1. Try File System Access API (Desktop Chrome/Edge)
    // This opens the native "Save As" dialog to pick a location
    // Skip if in iframe as it's blocked by browser policy
    if (!isInIframe && 'showSaveFilePicker' in window) {
      try {
        const handle = await (window as any).showSaveFilePicker({
          suggestedName: sanitizedName,
          types: [{
            description: 'Arquivo',
            accept: { [file.type]: [`.${sanitizedName.split('.').pop()}`] },
          }],
        });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        return true;
      } catch (error) {
        if ((error as Error).name === 'AbortError') return true; // User cancelled
        console.warn("File System Access API failed, trying share:", error);
      }
    }

    // 2. Try sharing (best for mobile)
    // On Android/iOS, this opens the native share sheet which includes "Save to Files"
    // Note: navigator.share often fails in cross-origin iframes
    if (navigator.share) {
      try {
        // Check if file sharing is supported
        const canShareFiles = navigator.canShare && navigator.canShare({ files: [file] });
        if (canShareFiles) {
          await navigator.share({
            files: [file],
            title: sanitizedName,
            text: 'Relatório/Backup Delicata'
          });
          return true;
        }
      } catch (error) {
        if ((error as Error).name === 'AbortError') return true; // User cancelled
        // Only log warning if not in iframe, as it's expected to fail in iframe
        if (!isInIframe) {
          console.warn("Share failed, falling back to download:", error);
        }
      }
    }

    // 3. Fallback to direct download
    // This is the most reliable method in an iframe context
    try {
      if (isInIframe) {
        showToast('Salvando arquivo... Para recursos avançados, abra o app em uma nova aba.', 'info');
      } else {
        showToast('Iniciando download...', 'info');
      }
      
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = sanitizedName;
      
      // For mobile compatibility, ensure the link is in the DOM
      link.style.display = 'none';
      document.body.appendChild(link);
      
      // Trigger click immediately to maintain user activation context
      link.click();
      
      // Cleanup after a short delay
      setTimeout(() => {
        if (document.body.contains(link)) {
          document.body.removeChild(link);
        }
        URL.revokeObjectURL(url);
      }, 1000);
      
      return true;
    } catch (error) {
      console.error("Download failed:", error);
      return false;
    }
  };

  const handleBackup = async (isAuto = false) => {
    if (!isAuto) setIsExporting(true);
    try {
      const data = JSON.stringify(sales, null, 2);
      const now = new Date();
      const dateStr = format(now, 'dd/MM/yyyy HH:mm');
      const fileName = `Backup_Delicata_${format(now, 'dd-MM-yyyy')}`;
      
      if (!isAuto) {
        const blob = new Blob([data], { type: 'application/json' });
        const file = new File([blob], `${fileName}.json`, { type: 'application/json' });

        const success = await saveOrShareFile(file, blob, `${fileName}.json`);
        if (success) {
          showToast('Backup gerado com sucesso!', 'success');
        } else {
          showToast('Erro ao gerar backup.', 'error');
        }
      }

      // Save to IndexedDB for history - do this after file saving to preserve user activation
      await db.backups.add({
        date: format(now, 'yyyy-MM-dd'),
        timestamp: now.getTime(),
        content: data
      });

      setLastBackupDate(dateStr);
      localStorage.setItem('delicata_last_backup', dateStr);
    } catch (error) {
      console.error("Backup error:", error);
      if (!isAuto) showToast('Erro ao processar backup.', 'error');
    } finally {
      if (!isAuto) setIsExporting(false);
    }
  };

  // Auto Backup Effect
  useEffect(() => {
    const checkAutoBackup = async () => {
      const now = new Date();
      // Check if it's 23:00 (11 PM)
      if (now.getHours() === 23 && now.getMinutes() === 0) {
        const lastAutoBackup = localStorage.getItem('delicata_last_auto_backup');
        const today = format(now, 'yyyy-MM-dd');
        
        if (lastAutoBackup !== today) {
          await handleBackup(true);
          localStorage.setItem('delicata_last_auto_backup', today);
        }
      }
    };

    const interval = setInterval(checkAutoBackup, 60000); // Check every minute
    return () => clearInterval(interval);
  }, [sales, isGDriveAuthenticated]);

  // Reports State
  const [startDate, setStartDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));

  const currentItemSubtotal = useMemo(() => quantity * unitPrice, [quantity, unitPrice]);
  const saleTotalValue = useMemo(() => {
    const subtotal = currentItems.reduce((acc, item) => acc + item.subtotal, 0);
    return Math.max(0, subtotal - discount);
  }, [currentItems, discount]);

  // Quick Stats
  const stats = useMemo(() => {
    const today = new Date();
    
    const getStatsForRange = (start: Date, end: Date) => {
      const filtered = sales.filter(s => isWithinInterval(new Date(s.timestamp), { start, end }));
      return {
        count: filtered.length,
        total: filtered.reduce((acc, s) => acc + s.totalValue, 0)
      };
    };

    return {
      today: getStatsForRange(startOfDay(today), endOfDay(today)),
      week: getStatsForRange(startOfWeek(today, { weekStartsOn: 0 }), endOfDay(today)),
      month: getStatsForRange(startOfMonth(today), endOfDay(today)),
      year: getStatsForRange(startOfYear(today), endOfDay(today)),
      monthName: format(today, 'MMMM', { locale: ptBR })
    };
  }, [sales]);

  // Last 30 Days Chart Data
  const chartData = useMemo(() => {
    const end = endOfDay(new Date());
    const start = startOfDay(subDays(end, 29));
    const days = eachDayOfInterval({ start, end });

    return days.map(day => {
      const daySales = sales.filter(s => isSameDay(new Date(s.timestamp), day));
      return {
        name: format(day, 'dd/MM'),
        total: daySales.reduce((acc, s) => acc + s.totalValue, 0),
        fullDate: day
      };
    });
  }, [sales]);

  const customPeriodSales = useMemo(() => {
    const start = startOfDay(new Date(startDate + 'T00:00:00'));
    const end = endOfDay(new Date(endDate + 'T23:59:59'));
    return sales.filter(s => isWithinInterval(new Date(s.timestamp), { start, end }));
  }, [sales, startDate, endDate]);

  const customPeriodTotal = useMemo(() => 
    customPeriodSales.reduce((acc, s) => acc + s.totalValue, 0), 
  [customPeriodSales]);

  const handleAddItem = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!productType || quantity <= 0 || unitPrice <= 0) return;

    const newItem: SaleItem = {
      product: productType,
      quantity,
      unitPrice,
      subtotal: currentItemSubtotal
    };

    setCurrentItems([...currentItems, newItem]);
    setProductType('');
    setQuantity(1);
    setUnitPrice(0);
  };

  const removeItem = (index: number) => {
    setCurrentItems(currentItems.filter((_, i) => i !== index));
  };

  const handleCancelSale = () => {
    setCurrentItems([]);
    setProductType('');
    setCustomerName('Cliente Delicata');
    setQuantity(1);
    setUnitPrice(0);
    setDiscount(0);
    setPaymentType('dinheiro');
    setInstallments(1);
    setIsAdding(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (currentItems.length === 0) return;

    await db.sales.add({
      customerName: customerName || 'Cliente Delicata',
      items: currentItems,
      totalValue: saleTotalValue,
      discount: discount > 0 ? discount : undefined,
      paymentType,
      installments: paymentType === 'credito_parcelado' ? installments : undefined,
      timestamp: Date.now(),
    });

    handleCancelSale();
  };

  const deleteSale = async (id?: number) => {
    if (id) {
      await db.sales.delete(id);
      if (saleToView?.id === id) {
        setShowSaleDetail(false);
        setSaleToView(null);
      }
    }
  };

  const handleRestore = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const fileName = file.name;
    const dateMatch = fileName.match(/(\d{4}-\d{2}-\d{2})/);
    let fileDate = fileName;
    if (dateMatch) {
      const [y, m, d] = dateMatch[1].split('-');
      fileDate = `${d}/${m}/${y}`;
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const content = e.target?.result as string;
        const importedSales = JSON.parse(content) as Sale[];
        
        await db.sales.clear();
        await db.sales.bulkAdd(importedSales.map(({ id, ...rest }) => rest));
        
        setShowRestoreConfirm(false);
        setShowRestoreMenu(false);
        showToast(`Banco de dados restaurado para a data escolhida: ${fileDate}`, 'success');
      } catch (err) {
        showToast('Erro ao restaurar o banco de dados. Verifique o arquivo.', 'error');
      }
    };
    reader.readAsText(file);
  };

  const handleExport = async () => {
    if (!sales) return;
    setIsExporting(true);
    showToast('Gerando relatório...', 'info');

    try {
      const data: any[] = [];
      const headers = exportPeriod === 'MENSAL' 
        ? ["Data", "Dinheiro", "Pix", "Débito", "Crédito", "Total do Dia"]
        : ["Mês", "Dinheiro", "Pix", "Débito", "Crédito", "Total Mensal"];
      
      let totalDinheiro = 0;
      let totalPix = 0;
      let totalDebito = 0;
      let totalCredito = 0;
      let totalGeral = 0;

      if (exportPeriod === 'MENSAL') {
        const date = setYear(setMonth(new Date(), exportMonth), exportYear);
        const days = getDaysInMonth(date);
        const monthStart = startOfMonth(date);
        const monthEnd = endOfMonth(date);
        
        // Filter once for the whole month to improve performance
        const monthSales = sales.filter(s => isWithinInterval(new Date(s.timestamp), { start: monthStart, end: monthEnd }));
        
        for (let i = 1; i <= days; i++) {
          const currentDay = new Date(exportYear, exportMonth, i);
          const daySales = monthSales.filter(s => isSameDay(new Date(s.timestamp), currentDay));
          
          const dinheiro = daySales.filter(s => s.paymentType === 'dinheiro').reduce((acc, s) => acc + s.totalValue, 0);
          const pix = daySales.filter(s => s.paymentType === 'pix').reduce((acc, s) => acc + s.totalValue, 0);
          const debito = daySales.filter(s => s.paymentType === 'debito').reduce((acc, s) => acc + s.totalValue, 0);
          const credito = daySales.filter(s => s.paymentType === 'credito_vista' || s.paymentType === 'credito_parcelado').reduce((acc, s) => acc + s.totalValue, 0);
          const total = dinheiro + pix + debito + credito;

          data.push([
            format(currentDay, 'dd/MM/yyyy'),
            dinheiro.toLocaleString('pt-BR', { minimumFractionDigits: 2 }),
            pix.toLocaleString('pt-BR', { minimumFractionDigits: 2 }),
            debito.toLocaleString('pt-BR', { minimumFractionDigits: 2 }),
            credito.toLocaleString('pt-BR', { minimumFractionDigits: 2 }),
            total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })
          ]);

          totalDinheiro += dinheiro;
          totalPix += pix;
          totalDebito += debito;
          totalCredito += credito;
          totalGeral += total;
        }
      } else {
        // Annual - Filter once for the whole year
        const yearStart = startOfYear(new Date(exportYear, 0, 1));
        const yearEnd = endOfYear(new Date(exportYear, 11, 31));
        const yearSales = sales.filter(s => isWithinInterval(new Date(s.timestamp), { start: yearStart, end: yearEnd }));

        for (let i = 0; i < 12; i++) {
          const currentMonth = new Date(exportYear, i, 1);
          const monthStart = startOfMonth(currentMonth);
          const monthEnd = endOfMonth(currentMonth);
          const monthSales = yearSales.filter(s => isWithinInterval(new Date(s.timestamp), { start: monthStart, end: monthEnd }));
          
          const dinheiro = monthSales.filter(s => s.paymentType === 'dinheiro').reduce((acc, s) => acc + s.totalValue, 0);
          const pix = monthSales.filter(s => s.paymentType === 'pix').reduce((acc, s) => acc + s.totalValue, 0);
          const debito = monthSales.filter(s => s.paymentType === 'debito').reduce((acc, s) => acc + s.totalValue, 0);
          const credito = monthSales.filter(s => s.paymentType === 'credito_vista' || s.paymentType === 'credito_parcelado').reduce((acc, s) => acc + s.totalValue, 0);
          const total = dinheiro + pix + debito + credito;

          data.push([
            format(currentMonth, 'MMMM', { locale: ptBR }),
            dinheiro.toLocaleString('pt-BR', { minimumFractionDigits: 2 }),
            pix.toLocaleString('pt-BR', { minimumFractionDigits: 2 }),
            debito.toLocaleString('pt-BR', { minimumFractionDigits: 2 }),
            credito.toLocaleString('pt-BR', { minimumFractionDigits: 2 }),
            total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })
          ]);

          totalDinheiro += dinheiro;
          totalPix += pix;
          totalDebito += debito;
          totalCredito += credito;
          totalGeral += total;
        }
      }

      // Add Totals Row
      data.push([
        exportPeriod === 'MENSAL' ? "TOTAIS" : "Total Geral",
        totalDinheiro.toLocaleString('pt-BR', { minimumFractionDigits: 2 }),
        totalPix.toLocaleString('pt-BR', { minimumFractionDigits: 2 }),
        totalDebito.toLocaleString('pt-BR', { minimumFractionDigits: 2 }),
        totalCredito.toLocaleString('pt-BR', { minimumFractionDigits: 2 }),
        totalGeral.toLocaleString('pt-BR', { minimumFractionDigits: 2 })
      ]);

      const periodText = exportPeriod === 'MENSAL' 
        ? `Período: ${format(setMonth(new Date(), exportMonth), 'MMMM', { locale: ptBR })} ${exportYear}`
        : `Período: ${exportYear}`;

      const typeText = exportPeriod === 'MENSAL' ? 'Mensal' : 'Anual';
      const dateText = exportPeriod === 'MENSAL' 
        ? format(setMonth(new Date(), exportMonth), 'MMMM_yyyy', { locale: ptBR })
        : exportYear;
      const fileName = `Delicata_Relatorio_${typeText}_${dateText}`;

      if (exportFormat === 'PDF') {
        const doc = new jsPDF();
        
        // Top accent line
        doc.setFillColor(107, 13, 13);
        doc.rect(0, 0, 210, 2, 'F');

        // Header - Logo and Company Name
        doc.setFillColor(107, 13, 13);
        doc.circle(25, 20, 7, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text("D", 25, 21.5, { align: 'center' });

        doc.setFontSize(22);
        doc.setTextColor(107, 13, 13);
        doc.text("Delicata", 35, 23);
        
        // Report Title and Period (Right aligned)
        doc.setFontSize(14);
        doc.setTextColor(0, 0, 0);
        doc.setFont('helvetica', 'bold');
        doc.text("Relatório de Vendas", 190, 20, { align: 'right' });
        
        doc.setFontSize(10);
        doc.setTextColor(100, 100, 100);
        doc.setFont('helvetica', 'normal');
        doc.text(periodText, 190, 26, { align: 'right' });
        
        // Divider
        doc.setDrawColor(230, 230, 230);
        doc.line(20, 32, 190, 32);
        
        autoTable(doc, {
          head: [headers],
          body: data,
          startY: 38,
          theme: 'striped',
          headStyles: { 
            fillColor: [107, 13, 13],
            textColor: [255, 255, 255],
            fontSize: 10,
            fontStyle: 'bold',
            halign: 'center'
          },
          alternateRowStyles: {
            fillColor: [252, 248, 248]
          },
          styles: { 
            fontSize: 8,
            cellPadding: 3,
            valign: 'middle'
          },
          columnStyles: {
            0: { fontStyle: 'bold', cellWidth: 30 },
            1: { halign: 'right' },
            2: { halign: 'right' },
            3: { halign: 'right' },
            4: { halign: 'right' },
            5: { halign: 'right', fontStyle: 'bold', fillColor: [245, 240, 240] }
          },
          didParseCell: (data) => {
            // Highlight total row
            if (data.row.index === data.table.body.length - 1) {
              data.cell.styles.fontStyle = 'bold';
              data.cell.styles.fillColor = [107, 13, 13];
              data.cell.styles.textColor = [255, 255, 255];
            }
          },
          didDrawPage: (data) => {
            // Footer
            doc.setFontSize(8);
            doc.setTextColor(150);
            const pageStr = "Página " + doc.getNumberOfPages();
            const dateStr = "Gerado em: " + format(new Date(), 'dd/MM/yyyy HH:mm');
            doc.text(pageStr, 190, 285, { align: 'right' });
            doc.text(dateStr, 20, 285);
          }
        });
        
        const pdfBlob = doc.output('blob');
        const pdfFile = new File([pdfBlob], `${fileName}.pdf`, { type: 'application/pdf' });
        
        const success = await saveOrShareFile(pdfFile, pdfBlob, `${fileName}.pdf`);
        if (success) {
          showToast('Relatório PDF gerado!', 'success');
        } else {
          showToast('Erro ao gerar PDF.', 'error');
        }
      } else {
        // Excel Export with similar structure
        const titleRow = ["DELICATA"];
        const subtitleRow = ["Relatório de Vendas"];
        const periodRow = [periodText];
        const emptyRow = [""];
        
        const ws = XLSX.utils.aoa_to_sheet([
          titleRow,
          subtitleRow,
          periodRow,
          emptyRow,
          headers,
          ...data
        ]);

        // Adjust column widths
        const wscols = [
          { wch: 15 }, // Data/Mês
          { wch: 12 }, // Dinheiro
          { wch: 12 }, // Pix
          { wch: 12 }, // Débito
          { wch: 12 }, // Crédito
          { wch: 15 }, // Total do Dia / Mensal
        ];
        ws['!cols'] = wscols;

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Relatório");
        
        const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
        const excelBlob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const excelFile = new File([excelBlob], `${fileName}.xlsx`, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

        const success = await saveOrShareFile(excelFile, excelBlob, `${fileName}.xlsx`);
        if (success) {
          showToast('Relatório Excel gerado!', 'success');
        } else {
          showToast('Erro ao gerar Excel.', 'error');
        }
      }
    } catch (error) {
      console.error("Export error:", error);
      showToast('Erro ao exportar relatório.', 'error');
    } finally {
      setIsExporting(false);
      setShowExportOptions(false);
    }
  };

  const generateReportData = () => {
    if (!sales) return null;
    const rows: any[] = [];
    const headers = exportPeriod === 'MENSAL' 
      ? ["Data", "Dinheiro", "Pix", "Débito", "Crédito", "Total"]
      : ["Mês", "Dinheiro", "Pix", "Débito", "Crédito", "Total"];
    
    let totalDinheiro = 0;
    let totalPix = 0;
    let totalDebito = 0;
    let totalCredito = 0;
    let totalGeral = 0;

    if (exportPeriod === 'MENSAL') {
      const date = setYear(setMonth(new Date(), exportMonth), exportYear);
      const days = getDaysInMonth(date);
      const monthStart = startOfMonth(date);
      const monthEnd = endOfMonth(date);
      
      // Filter once for the whole month to improve performance
      const monthSales = sales.filter(s => isWithinInterval(new Date(s.timestamp), { start: monthStart, end: monthEnd }));
      
      for (let i = 1; i <= days; i++) {
        const currentDay = new Date(exportYear, exportMonth, i);
        const daySales = monthSales.filter(s => isSameDay(new Date(s.timestamp), currentDay));
        
        const dinheiro = daySales.filter(s => s.paymentType === 'dinheiro').reduce((acc, s) => acc + s.totalValue, 0);
        const pix = daySales.filter(s => s.paymentType === 'pix').reduce((acc, s) => acc + s.totalValue, 0);
        const debito = daySales.filter(s => s.paymentType === 'debito').reduce((acc, s) => acc + s.totalValue, 0);
        const credito = daySales.filter(s => s.paymentType === 'credito_vista' || s.paymentType === 'credito_parcelado').reduce((acc, s) => acc + s.totalValue, 0);
        const total = dinheiro + pix + debito + credito;

        rows.push([
          format(currentDay, 'dd/MM/yyyy'),
          dinheiro,
          pix,
          debito,
          credito,
          total
        ]);

        totalDinheiro += dinheiro;
        totalPix += pix;
        totalDebito += debito;
        totalCredito += credito;
        totalGeral += total;
      }
    } else {
      // Annual - Filter once for the whole year
      const yearStart = startOfYear(new Date(exportYear, 0, 1));
      const yearEnd = endOfYear(new Date(exportYear, 11, 31));
      const yearSales = sales.filter(s => isWithinInterval(new Date(s.timestamp), { start: yearStart, end: yearEnd }));

      for (let i = 0; i < 12; i++) {
        const currentMonth = new Date(exportYear, i, 1);
        const monthStart = startOfMonth(currentMonth);
        const monthEnd = endOfMonth(currentMonth);
        const monthSales = yearSales.filter(s => isWithinInterval(new Date(s.timestamp), { start: monthStart, end: monthEnd }));
        
        const dinheiro = monthSales.filter(s => s.paymentType === 'dinheiro').reduce((acc, s) => acc + s.totalValue, 0);
        const pix = monthSales.filter(s => s.paymentType === 'pix').reduce((acc, s) => acc + s.totalValue, 0);
        const debito = monthSales.filter(s => s.paymentType === 'debito').reduce((acc, s) => acc + s.totalValue, 0);
        const credito = monthSales.filter(s => s.paymentType === 'credito_vista' || s.paymentType === 'credito_parcelado').reduce((acc, s) => acc + s.totalValue, 0);
        const total = dinheiro + pix + debito + credito;

        rows.push([
          format(currentMonth, 'MMMM', { locale: ptBR }),
          dinheiro,
          pix,
          debito,
          credito,
          total
        ]);

        totalDinheiro += dinheiro;
        totalPix += pix;
        totalDebito += debito;
        totalCredito += credito;
        totalGeral += total;
      }
    }

    const periodText = exportPeriod === 'MENSAL' 
      ? `${format(setMonth(new Date(), exportMonth), 'MMMM', { locale: ptBR })} ${exportYear}`
      : `${exportYear}`;

    return {
      headers,
      rows,
      title: "Relatório de Vendas",
      period: periodText,
      totals: {
        dinheiro: totalDinheiro,
        pix: totalPix,
        debito: totalDebito,
        credito: totalCredito,
        total: totalGeral
      }
    };
  };

  const handlePreviewReport = () => {
    const data = generateReportData();
    if (data) {
      setReportPreviewData(data);
      setShowReportPreview(true);
      setShowExportOptions(false);
    }
  };

  const getViewTitle = () => {
    switch(currentView) {
      case 'sales': return 'Registro de Vendas';
      case 'reports': return 'Relatório de Vendas';
      case 'settings': return 'Configurações';
      default: return '';
    }
  };

  const getViewIcon = () => {
    switch(currentView) {
      case 'sales': return <ShoppingBag className="w-5 h-5 text-[#6B0D0D]" />;
      case 'reports': return <BarChart3 className="w-5 h-5 text-[#6B0D0D]" />;
      case 'settings': return <Settings className="w-5 h-5 text-[#6B0D0D]" />;
      default: return null;
    }
  };

  return (
    <div className="min-h-screen bg-[#FDFCFB] text-black font-sans pb-24 pt-[env(safe-area-inset-top,0px)]">
      <AnimatePresence mode="wait">
        {!isAuthenticated ? (
          <motion.div
            key="login-screen"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-[#FDFCFB] flex flex-col items-center justify-center p-6"
          >
            <div className="w-full max-w-sm space-y-8 text-center">
              <div className="space-y-2">
                <div className="w-20 h-20 bg-[#6B0D0D] rounded-full flex items-center justify-center mx-auto shadow-2xl shadow-[#6B0D0D]/20 mb-6">
                  <ShoppingBag className="w-10 h-10 text-white" />
                </div>
                <h1 className="text-3xl font-black tracking-tighter text-[#6B0D0D]">DELICATA</h1>
                <p className="text-xs font-bold text-black/40 uppercase tracking-[0.2em]">Acesso Restrito</p>
              </div>

              <form onSubmit={handleLogin} className="space-y-4">
                <div className="relative group">
                  <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                    <Lock className="w-5 h-5 text-black/20 group-focus-within:text-[#6B0D0D] transition-colors" />
                  </div>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onFocus={(e) => e.target.select()}
                    placeholder="Digite sua senha"
                    className={cn(
                      "w-full bg-white border-2 border-black/5 rounded-2xl py-4 pl-12 pr-4 text-sm font-bold focus:outline-none focus:border-[#6B0D0D] transition-all shadow-sm",
                      authError && "border-red-500 animate-shake"
                    )}
                    autoFocus
                  />
                </div>

                <button
                  type="submit"
                  className="w-full bg-[#6B0D0D] text-white py-4 rounded-2xl font-bold text-sm shadow-xl shadow-[#6B0D0D]/20 active:scale-[0.98] transition-all"
                >
                  Entrar no Aplicativo
                </button>
              </form>
            </div>
          </motion.div>
        ) : (
          <>
            {/* Header */}
            <header className="bg-white/80 backdrop-blur-md border-b border-black/5 sticky top-0 z-30 pt-[env(safe-area-inset-top,0px)]">
              <div className="max-w-md mx-auto px-6 py-4 flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-[#6B0D0D] rounded-2xl flex items-center justify-center shadow-lg transform rotate-3">
                    <svg viewBox="0 0 24 24" className="w-6 h-6 text-white fill-current" xmlns="http://www.w3.org/2000/svg">
                      <path d="M12,16C12,16 9,13 7,13C5,13 3,14 3,16C3,18 5,20 7,20C9,20 12,17 12,17M12,16C12,16 15,13 17,13C19,13 21,14 21,16C21,18 19,20 17,20C15,20 12,17 12,17M12,10C12,10 9,7 7,7C5,7 3,8 3,10C3,12 5,14 7,14C9,14 12,11 12,11M12,10C12,10 15,7 17,7C19,7 21,8 21,10C21,12 19,14 17,14C15,14 12,11 12,11" />
                    </svg>
                  </div>
                  <div>
                    <h1 className="text-xl font-black tracking-tight text-[#6B0D0D] uppercase">Delicata</h1>
                    <p className="text-[9px] uppercase tracking-[0.2em] text-black/40 font-bold">
                      {getViewTitle()}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {currentView === 'reports' && (
                    <div className="relative">
                      <motion.button 
                        whileTap={{ scale: 0.9 }}
                        onClick={() => setShowExportMenu(!showExportMenu)}
                        className="p-2 bg-black/5 rounded-full transition-colors"
                      >
                        <MoreVertical className="w-5 h-5 text-black/60" />
                      </motion.button>
                
                <AnimatePresence>
                  {showExportMenu && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95, y: -10 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95, y: -10 }}
                      className="absolute right-0 mt-2 w-48 bg-white rounded-2xl shadow-2xl border border-black/5 z-50 overflow-hidden"
                    >
                      <div className="px-4 py-2 bg-black/5 border-b border-black/5">
                        <p className="text-[8px] font-black uppercase tracking-widest text-black/30">Geração Local</p>
                      </div>
                      <button
                        onClick={() => {
                          setShowExportMenu(false);
                          setShowExportOptions(true);
                        }}
                        className="w-full text-left px-4 py-3 text-xs font-bold uppercase tracking-widest text-[#6B0D0D] hover:bg-black/5 transition-colors flex items-center gap-2"
                      >
                        <FileText className="w-4 h-4" />
                        Exportar Relatório
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 pt-6">
        <AnimatePresence mode="wait">
          {currentView === 'sales' ? (
            <motion.div
              key="sales-view"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="space-y-6"
            >
              {/* Summary Card */}
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white rounded-3xl p-6 shadow-xl border border-black/5"
              >
                <div className="flex justify-between items-start mb-4">
                  <span className="text-xs font-bold uppercase tracking-wider text-[#6B0D0D]">Vendas Hoje</span>
                  <Calendar className="w-4 h-4 text-black/40" />
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-sm font-semibold text-black/40">R$</span>
                  <span className="text-4xl font-light tracking-tighter text-black">
                    {stats.today.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="mt-4 pt-4 border-t border-black/5 flex justify-between text-xs text-black/60">
                  <span>{stats.today.count} registros hoje</span>
                  <button onClick={() => setCurrentView('reports')} className="text-[#6B0D0D] font-bold">Ver relatórios</button>
                </div>
              </motion.div>

              {/* Add Sale Button */}
              {!isAdding && (
                <motion.button
                  layoutId="add-button"
                  onClick={() => setIsAdding(true)}
                  className="w-full bg-[#6B0D0D] text-white rounded-2xl py-4 flex items-center justify-center gap-2 font-bold shadow-lg active:scale-95 transition-transform"
                >
                  <Plus className="w-5 h-5" />
                  Nova Venda
                </motion.button>
              )}

              {/* Add Sale Form */}
              <AnimatePresence>
                {isAdding && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="bg-white rounded-3xl p-6 shadow-xl border border-black/10 space-y-4"
                  >
                    <div className="flex justify-between items-center mb-2">
                      <h2 className="font-bold text-lg text-[#6B0D0D]">Nova Venda</h2>
                      <button onClick={handleCancelSale} className="text-black/40 p-1">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="space-y-4">
                      {/* Customer Name Input */}
                      <div className="space-y-1">
                        <label className="text-[10px] uppercase font-bold text-black/60 ml-1">Nome do Cliente</label>
                        <input
                          type="text"
                          placeholder="Ex: Cliente Delicata"
                          value={customerName}
                          onChange={(e) => setCustomerName(e.target.value)}
                          onFocus={(e) => e.target.select()}
                          className="w-full bg-black/5 border border-black/10 rounded-xl py-3 px-4 focus:ring-2 focus:ring-[#6B0D0D] transition-all outline-none text-black placeholder:text-black/40"
                        />
                      </div>

                      {/* Item Input Section */}
                      <div className="bg-black/5 p-4 rounded-2xl space-y-4">
                        <div className="space-y-1">
                          <label className="text-[10px] uppercase font-bold text-black/60 ml-1">Produto</label>
                          <div className="relative">
                            <Package className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-black/40" />
                            <input
                              type="text"
                              placeholder="Ex: Vestido Floral"
                              value={productType}
                              onChange={(e) => setProductType(e.target.value)}
                              onFocus={(e) => e.target.select()}
                              className="w-full bg-white border border-black/10 rounded-xl py-3 pl-10 pr-4 focus:ring-2 focus:ring-[#6B0D0D] transition-all outline-none text-black placeholder:text-black/40"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-1">
                            <label className="text-[10px] uppercase font-bold text-black/60 ml-1">Qtd</label>
                            <input
                              type="number"
                              min="1"
                              value={quantity}
                              onChange={(e) => setQuantity(Number(e.target.value))}
                              onFocus={(e) => e.target.select()}
                              className="w-full bg-white border border-black/10 rounded-xl py-3 px-4 focus:ring-2 focus:ring-[#6B0D0D] transition-all outline-none text-black"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] uppercase font-bold text-black/60 ml-1">V. Unitário</label>
                            <div className="relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-black/40 text-sm">R$</span>
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={unitPrice}
                                onChange={(e) => setUnitPrice(Number(e.target.value))}
                                onFocus={(e) => e.target.select()}
                                className="w-full bg-white border border-black/10 rounded-xl py-3 pl-9 pr-4 focus:ring-2 focus:ring-[#6B0D0D] transition-all outline-none text-black"
                              />
                            </div>
                          </div>
                        </div>

                        <div className="flex justify-between items-center pt-2">
                          <div className="text-[10px] uppercase font-bold text-black/40">
                            Subtotal: <span className="text-black">R$ {currentItemSubtotal.toFixed(2)}</span>
                          </div>
                          <button
                            type="button"
                            onClick={handleAddItem}
                            disabled={!productType || quantity <= 0 || unitPrice <= 0}
                            className="bg-[#6B0D0D] text-white text-[10px] font-bold uppercase px-4 py-2 rounded-xl disabled:opacity-50"
                          >
                            Inserir Produto
                          </button>
                        </div>
                      </div>

                      {/* Items List */}
                      {currentItems.length > 0 && (
                        <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                          <p className="text-[10px] uppercase font-bold text-black/40 ml-1">Itens da Venda</p>
                          {currentItems.map((item, index) => (
                            <div key={index} className="flex items-center justify-between bg-black/5 p-3 rounded-xl">
                              <div className="min-w-0 flex-1">
                                <p className="text-xs font-bold truncate">{item.product}</p>
                                <p className="text-[10px] text-black/40">{item.quantity}x R$ {item.unitPrice.toFixed(2)}</p>
                              </div>
                              <div className="flex items-center gap-3">
                                <span className="text-xs font-bold">R$ {item.subtotal.toFixed(2)}</span>
                                <button onClick={() => removeItem(index)} className="text-red-500">
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      <form onSubmit={handleSubmit} className="space-y-6">
                        <div className="space-y-1">
                          <label className="text-[10px] uppercase font-bold text-black/60 ml-1">Desconto</label>
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-black/40 text-sm">R$</span>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={discount || ''}
                              onChange={(e) => setDiscount(Number(e.target.value))}
                              onFocus={(e) => e.target.select()}
                              className="w-full bg-white border border-black/10 rounded-xl py-3 pl-9 pr-4 focus:ring-2 focus:ring-[#6B0D0D] transition-all outline-none text-black"
                              placeholder="0,00"
                            />
                          </div>
                        </div>

                        <div className="bg-[#6B0D0D] rounded-2xl p-4 flex justify-between items-center text-white shadow-xl">
                          <div>
                            <p className="text-[10px] uppercase opacity-70 font-bold">Total da Venda</p>
                            <p className="text-xl font-light tracking-tight">
                              R$ {saleTotalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </p>
                          </div>
                          <div className="bg-white/10 p-2 rounded-xl">
                            <DollarSign className="w-5 h-5 text-white/70" />
                          </div>
                        </div>

                        <div className="space-y-1">
                          <label className="text-[10px] uppercase font-bold text-black/60 ml-1">Pagamento</label>
                          <div className="grid grid-cols-2 gap-2">
                            {(Object.keys(PAYMENT_LABELS) as PaymentType[]).map((type) => (
                              <button
                                key={type}
                                type="button"
                                onClick={() => setPaymentType(type)}
                                className={cn(
                                  "py-2 px-3 rounded-xl text-[10px] font-bold border transition-all uppercase tracking-tighter",
                                  paymentType === type 
                                    ? "bg-[#6B0D0D] border-[#6B0D0D] text-white shadow-sm" 
                                    : "bg-white border-black/10 text-black/40 hover:border-black/20"
                                )}
                              >
                                {PAYMENT_LABELS[type]}
                              </button>
                            ))}
                          </div>
                        </div>

                        {paymentType === 'credito_parcelado' && (
                          <div className="space-y-1">
                            <label className="text-[10px] uppercase font-bold text-black/60 ml-1">Número de Parcelas</label>
                            <input
                              required
                              type="number"
                              min="1"
                              max="24"
                              value={installments}
                              onChange={(e) => setInstallments(Number(e.target.value))}
                              onFocus={(e) => e.target.select()}
                              className="w-full bg-black/5 border border-black/10 rounded-xl py-3 px-4 focus:ring-2 focus:ring-[#6B0D0D] transition-all outline-none text-black"
                            />
                          </div>
                        )}

                        <div className="flex flex-col gap-3 pt-2">
                          <button
                            type="submit"
                            disabled={currentItems.length === 0}
                            className="w-full bg-[#6B0D0D] text-white p-4 rounded-2xl hover:scale-[1.02] active:scale-[0.98] transition-all text-xs font-bold uppercase shadow-lg disabled:opacity-50 disabled:hover:scale-100"
                          >
                            Concluir Venda
                          </button>
                          <button
                            type="button"
                            onClick={handleCancelSale}
                            className="w-full bg-black/5 text-black/60 p-4 rounded-2xl hover:bg-black/10 transition-colors text-xs font-bold uppercase"
                          >
                            Cancelar
                          </button>
                        </div>
                      </form>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Sales List */}
              <div className="space-y-4">
                <div className="flex justify-between items-center px-2">
                  <h3 className="text-sm font-bold uppercase tracking-widest text-[#6B0D0D]">Últimas Vendas</h3>
                  <ArrowRightLeft className="w-4 h-4 text-black/20" />
                </div>

                <div className="space-y-3">
                  {sales.length === 0 ? (
                    <div className="text-center py-12 bg-white rounded-3xl border border-dashed border-black/10">
                      <Package className="w-12 h-12 text-black/5 mx-auto mb-3" />
                      <p className="text-black/40 text-sm">Nenhuma venda registrada ainda.</p>
                    </div>
                  ) : (
                    sales.slice(0, 5).map((sale) => (
                        <motion.div
                          layout
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          key={sale.id}
                          onClick={() => {
                            setSaleToView(sale);
                            setShowSaleDetail(true);
                          }}
                          className="bg-white rounded-2xl p-4 flex items-center gap-4 shadow-sm border border-black/5 transition-all cursor-pointer"
                        >
                          <div className="w-12 h-12 rounded-xl bg-black/5 flex items-center justify-center shrink-0 relative">
                            {sale.paymentType === 'dinheiro' ? (
                              <DollarSign className="w-6 h-6 text-[#6B0D0D]" />
                            ) : (
                              <CreditCard className="w-6 h-6 text-black/40" />
                            )}
                            {sale.paymentType === 'pix' && (
                              <div className="absolute -top-1 -right-1 w-5 h-5 bg-[#6B0D0D] rounded-full flex items-center justify-center border-2 border-white">
                                <span className="text-[10px] font-bold text-white">P</span>
                              </div>
                            )}
                          </div>
                          
                          <div className="flex-1 min-w-0">
                            <h4 className="font-bold text-sm truncate text-black">
                              {sale.customerName}
                            </h4>
                            <p className="text-[10px] text-black/40 font-medium">
                              {sale.items.length === 1 
                                ? sale.items[0].product 
                                : `${sale.items[0].product} + ${sale.items.length - 1} itens`} • {PAYMENT_LABELS[sale.paymentType]}
                              {sale.installments && ` (${sale.installments}x)`}
                            </p>
                          </div>

                          <div className="text-right">
                            <p className="font-bold text-sm text-black">R$ {sale.totalValue.toFixed(2)}</p>
                            <p className="text-[10px] text-black/40">
                              {new Date(sale.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </div>
                        </motion.div>
                    ))
                  )}
                </div>
              </div>

              {/* Delete Confirmation Modal */}
              <AnimatePresence>
                {showDeleteConfirm && (
                  <div className="fixed inset-0 z-[100] flex items-center justify-center px-6">
                    <motion.div 
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      onClick={() => setShowDeleteConfirm(null)}
                      className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                    />
                    <motion.div 
                      initial={{ scale: 0.9, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.9, opacity: 0 }}
                      className="bg-white w-full max-w-xs rounded-3xl p-6 shadow-2xl relative z-10 space-y-6"
                    >
                      <div className="text-center space-y-4">
                        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto">
                          <Trash2 className="w-8 h-8 text-[#6B0D0D]" />
                        </div>
                        <h3 className="font-bold text-black text-lg">Deseja cancelar esta venda?</h3>
                      </div>

                      <div className="space-y-3">
                        <button 
                          onClick={() => {
                            deleteSale(showDeleteConfirm);
                            setShowDeleteConfirm(null);
                          }}
                          className="w-full bg-[#6B0D0D] text-white py-4 rounded-2xl font-bold text-xs uppercase shadow-lg active:scale-95 transition-transform"
                        >
                          Sim, Cancelar
                        </button>
                        <button 
                          onClick={() => setShowDeleteConfirm(null)}
                          className="w-full py-3 text-[10px] font-bold uppercase text-black/40 tracking-widest"
                        >
                          Cancelar
                        </button>
                      </div>
                    </motion.div>
                  </div>
                )}
              </AnimatePresence>
            </motion.div>
          ) : currentView === 'reports' ? (
            <motion.div
              key="reports-view"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <div className="px-2 flex justify-between items-end mb-1">
                <div>
                  <h2 className="text-xl font-bold tracking-tight text-[#6B0D0D]">Total de Vendas</h2>
                  <div className="h-1 w-12 bg-[#6B0D0D] rounded-full"></div>
                </div>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-white rounded-3xl p-5 shadow-xl border border-black/5">
                  <p className="text-[10px] uppercase font-bold text-black/40 mb-1">DIÁRIO</p>
                  <p className="text-xl font-light tracking-tight text-black">R$ {stats.today.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                  <p className="text-[10px] text-[#6B0D0D] font-bold mt-1 uppercase">{stats.today.count} vendas</p>
                </div>
                <div className="bg-white rounded-3xl p-5 shadow-xl border border-black/5">
                  <p className="text-[10px] uppercase font-bold text-black/40 mb-1">SEMANAL</p>
                  <p className="text-xl font-light tracking-tight text-black">R$ {stats.week.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                  <p className="text-[10px] text-[#6B0D0D] font-bold mt-1 uppercase">{stats.week.count} vendas</p>
                </div>
                <div className="bg-white rounded-3xl p-5 shadow-xl border border-black/5">
                  <p className="text-[10px] uppercase font-bold text-black/40 mb-1">MÊS: <span className="text-black">{stats.monthName}</span></p>
                  <p className="text-xl font-light tracking-tight text-black">R$ {stats.month.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                  <p className="text-[10px] text-[#6B0D0D] font-bold mt-1 uppercase">{stats.month.count} vendas</p>
                </div>
                <div className="bg-white rounded-3xl p-5 shadow-xl border border-black/5">
                  <p className="text-[10px] uppercase font-bold text-black/40 mb-1">ANUAL</p>
                  <p className="text-xl font-light tracking-tight text-black">R$ {stats.year.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                  <p className="text-[10px] text-[#6B0D0D] font-bold mt-1 uppercase">{stats.year.count} vendas</p>
                </div>
              </div>

              {/* 30 Days Chart */}
              <div className="bg-white rounded-3xl p-6 shadow-xl border border-black/5 space-y-4">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp className="w-4 h-4 text-[#6B0D0D]" />
                  <h3 className="font-bold text-xs uppercase tracking-widest text-[#6B0D0D]">Vendas (Últimos 30 dias)</h3>
                </div>
                
                <div className="h-48 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData}>
                      <XAxis 
                        dataKey="name" 
                        hide 
                      />
                      <YAxis hide />
                      <Tooltip 
                        cursor={{ fill: 'rgba(0,0,0,0.02)' }}
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            return (
                              <div className="bg-white text-black p-2 rounded-lg text-[10px] shadow-xl border border-black/10">
                                <p className="font-bold">{payload[0].payload.name}</p>
                                <p className="text-[#6B0D0D] font-bold">R$ {payload[0].value?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      <Bar 
                        dataKey="total" 
                        radius={[4, 4, 0, 0]}
                      >
                        {chartData.map((entry, index) => (
                          <Cell 
                            key={`cell-${index}`} 
                            fill={entry.total > 0 ? '#6B0D0D' : 'rgba(0,0,0,0.05)'} 
                            className="transition-all duration-300"
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                
                <div className="flex justify-between text-[8px] uppercase font-bold text-black/40 px-1">
                  <span>{chartData[0]?.name}</span>
                  <span>Hoje</span>
                </div>
              </div>

              {/* Custom Period Filter */}
              <div className="bg-white rounded-3xl p-6 shadow-xl border border-black/5 space-y-4">
                <div className="flex items-center gap-2 mb-2">
                  <Search className="w-4 h-4 text-[#6B0D0D]" />
                  <h3 className="font-bold text-xs uppercase tracking-widest text-[#6B0D0D]">Consulta por Período</h3>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase font-bold text-black/60 ml-1">Início</label>
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      onFocus={(e) => e.target.select()}
                      className="w-full bg-black/5 border border-black/10 rounded-xl py-2 px-3 text-xs focus:ring-2 focus:ring-[#6B0D0D] outline-none text-black"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase font-bold text-black/60 ml-1">Fim</label>
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      onFocus={(e) => e.target.select()}
                      className="w-full bg-black/5 border border-black/10 rounded-xl py-2 px-3 text-xs focus:ring-2 focus:ring-[#6B0D0D] outline-none text-black"
                    />
                  </div>
                </div>

                <div className="bg-[#6B0D0D] rounded-2xl p-4 flex justify-between items-center text-white shadow-xl">
                  <div>
                    <p className="text-[10px] uppercase opacity-70 font-bold">Total no Período</p>
                    <p className="text-xl font-light tracking-tight">
                      R$ {customPeriodTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                  <div className="bg-black/10 p-2 rounded-xl">
                    <Download className="w-5 h-5 text-white/70" />
                  </div>
                </div>
              </div>

              {/* Filtered Sales List */}
              <div className="space-y-4">
                <div className="flex justify-between items-center px-2">
                  <h3 className="text-sm font-bold uppercase tracking-widest text-[#6B0D0D]">Vendas do Período</h3>
                  <span className="text-[10px] font-bold text-[#6B0D0D]">{customPeriodSales.length} registros</span>
                </div>

                <div className="space-y-3">
                  {customPeriodSales.length === 0 ? (
                    <div className="text-center py-12 bg-white rounded-3xl border border-dashed border-black/10">
                      <p className="text-black/40 text-sm">Nenhuma venda neste período.</p>
                    </div>
                  ) : (
                    customPeriodSales.map((sale) => (
                      <div
                        key={sale.id}
                        onClick={() => {
                          setSaleToView(sale);
                          setShowSaleDetail(true);
                        }}
                        className="bg-white rounded-2xl p-4 flex items-center gap-4 shadow-sm border border-black/5 transition-all cursor-pointer active:scale-[0.98]"
                      >
                        <div className="w-10 h-10 rounded-xl bg-black/5 flex items-center justify-center shrink-0">
                          <span className="text-[10px] font-bold text-black/40">
                            {format(new Date(sale.timestamp), 'dd/MM')}
                          </span>
                        </div>
                        
                        <div className="flex-1 min-w-0">
                          <h4 className="font-bold text-sm truncate text-black">
                            {sale.customerName}
                          </h4>
                          <p className="text-[10px] text-black/40 font-medium">
                            {sale.items.length === 1 
                              ? sale.items[0].product 
                              : `${sale.items[0].product} + ${sale.items.length - 1} itens`} • {PAYMENT_LABELS[sale.paymentType]}
                            {sale.installments && ` (${sale.installments}x)`}
                          </p>
                        </div>

                        <div className="text-right">
                          <p className="font-bold text-sm text-black">R$ {sale.totalValue.toFixed(2)}</p>
                          <p className="text-[10px] text-black/40">
                            {format(new Date(sale.timestamp), 'HH:mm')}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="settings-view"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="space-y-6"
            >
              <div className="px-2">
                <h2 className="text-xl font-bold tracking-tight text-[#6B0D0D] mb-1">Configurações</h2>
                <div className="h-1 w-12 bg-[#6B0D0D] rounded-full"></div>
              </div>

              <div className="bg-white rounded-3xl p-6 shadow-xl border border-black/5 space-y-6">
                <div className="flex items-center gap-3 pb-4 border-b border-black/5">
                  <div className="w-10 h-10 bg-[#6B0D0D]/10 rounded-xl flex items-center justify-center">
                    <Database className="w-5 h-5 text-[#6B0D0D]" />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-black">Banco de Dados</h3>
                    <p className="text-[10px] text-black/40 uppercase font-bold">Gerenciamento de dados locais</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-black/5 rounded-lg flex items-center justify-center">
                        <Download className="w-4 h-4 text-black/60" />
                      </div>
                      <span className="text-sm font-bold text-black">Backup Local</span>
                    </div>
                    <button 
                      onClick={() => handleBackup()}
                      disabled={isExporting}
                      className="bg-[#6B0D0D] text-white text-[10px] font-bold uppercase tracking-widest px-4 py-2 rounded-xl shadow-md active:scale-95 transition-transform disabled:opacity-50 disabled:scale-100"
                    >
                      {isExporting ? 'PROCESSANDO...' : 'FAZER BACKUP'}
                    </button>
                  </div>
                  <p className="text-[10px] text-black/60 leading-relaxed">
                    O backup exportará todas as suas vendas registradas para um arquivo JSON. 
                    Ao clicar em <strong>FAZER BACKUP</strong>, você poderá escolher onde salvar o arquivo no seu telefone.
                  </p>
                  
                  {lastBackupDate && (
                    <div className="pt-2 flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-green-500"></div>
                      <p className="text-[10px] text-black/40 font-bold uppercase">
                        Último backup: <span className="text-black/60">{lastBackupDate}</span>
                      </p>
                    </div>
                  )}
                </div>

                <div className="pt-4 border-t border-black/5 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center">
                        <Share2 className="w-4 h-4 text-blue-600" />
                      </div>
                      <span className="text-sm font-bold text-black">Backup Externo</span>
                    </div>
                    <button 
                      onClick={() => setShowShareMenu(true)}
                      className="bg-blue-600 text-white text-[10px] font-bold uppercase tracking-widest px-4 py-2 rounded-xl shadow-md active:scale-95 transition-transform"
                    >
                      Compartilhar
                    </button>
                  </div>
                  <p className="text-[10px] text-black/60 leading-relaxed">
                    Escolha para onde deseja enviar seu backup: Google Drive, WhatsApp, Gmail ou outras opções do seu celular.
                  </p>
                  {isGDriveAuthenticated && (
                    <div className="pt-2 flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-blue-500"></div>
                      <p className="text-[10px] text-blue-600 font-bold uppercase">
                        Google Drive Conectado
                      </p>
                    </div>
                  )}
                </div>

                <div className="pt-4 border-t border-black/5 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-black/5 rounded-lg flex items-center justify-center">
                        <ArrowRightLeft className="w-4 h-4 text-black/60" />
                      </div>
                      <span className="text-sm font-bold text-black">Restaurar</span>
                    </div>
                    <button 
                      onClick={() => setShowRestoreMenu(true)}
                      className="border border-[#6B0D0D] text-[#6B0D0D] text-[10px] font-bold uppercase tracking-widest px-4 py-2 rounded-xl active:scale-95 transition-transform"
                    >
                      Restaurar Banco
                    </button>
                  </div>
                </div>
              </div>

              {/* Restore Menu Modal */}
              <AnimatePresence>
                {showRestoreMenu && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center px-6">
                    <motion.div 
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      onClick={() => setShowRestoreMenu(false)}
                      className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                    />
                    <motion.div 
                      initial={{ scale: 0.9, opacity: 0, y: 20 }}
                      animate={{ scale: 1, opacity: 1, y: 0 }}
                      exit={{ scale: 0.9, opacity: 0, y: 20 }}
                      className="bg-white w-full max-w-xs rounded-3xl p-6 shadow-2xl relative z-10 space-y-6"
                    >
                      <div className="text-center">
                        <h3 className="font-bold text-[#6B0D0D] uppercase tracking-widest text-xs mb-4">Menu de Restauração</h3>
                        <div className="bg-black/5 rounded-2xl p-4 text-left space-y-2">
                          <p className="text-[10px] uppercase font-bold text-black/40">Backup Disponível</p>
                          {lastBackupDate ? (
                            <button 
                              onClick={() => setShowRestoreConfirm(true)}
                              className="w-full flex items-center justify-between bg-white border border-black/10 p-3 rounded-xl hover:border-[#6B0D0D] transition-colors"
                            >
                              <span className="text-xs font-bold text-black">{lastBackupDate}</span>
                              <ChevronRight className="w-4 h-4 text-[#6B0D0D]" />
                            </button>
                          ) : (
                            <p className="text-xs text-black/60 italic">Nenhum backup registrado localmente.</p>
                          )}
                        </div>
                      </div>
                      
                      <button 
                        onClick={() => setShowRestoreMenu(false)}
                        className="w-full py-3 text-[10px] font-bold uppercase text-black/40 tracking-widest"
                      >
                        Fechar
                      </button>
                    </motion.div>
                  </div>
                )}
              </AnimatePresence>

              {/* Restore Confirmation Modal */}
              <AnimatePresence>
                {showRestoreConfirm && (
                  <div className="fixed inset-0 z-[60] flex items-center justify-center px-6">
                    <motion.div 
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="absolute inset-0 bg-black/80 backdrop-blur-md"
                    />
                    <motion.div 
                      initial={{ scale: 0.9, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.9, opacity: 0 }}
                      className="bg-white w-full max-w-xs rounded-3xl p-6 shadow-2xl relative z-10 space-y-6"
                    >
                      <div className="text-center space-y-4">
                        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto">
                          <Database className="w-8 h-8 text-[#6B0D0D]" />
                        </div>
                        <h3 className="font-bold text-black text-lg">Deseja restaurar o banco de dados?</h3>
                        
                        <div className="bg-red-50 border border-red-100 rounded-2xl p-4 flex gap-3 text-left">
                          <div className="shrink-0 pt-0.5">
                            <div className="w-2 h-2 rounded-full bg-[#6B0D0D] animate-pulse"></div>
                          </div>
                          <p className="text-[10px] text-[#6B0D0D] font-bold uppercase leading-relaxed">
                            ALERTA: ESTA OPÇÃO FARÁ COM QUE TODOS OS REGISTROS DE VENDAS RETORNEM PARA A DATA ESCOLHIDA.
                          </p>
                        </div>
                      </div>

                      <div className="space-y-3">
                        <label className="block w-full">
                          <div className="w-full bg-[#6B0D0D] text-white py-4 rounded-2xl flex items-center justify-center gap-2 font-bold text-xs uppercase shadow-lg cursor-pointer active:scale-95 transition-transform">
                            <Download className="w-4 h-4" />
                            Selecionar Arquivo e Restaurar
                          </div>
                          <input 
                            type="file" 
                            accept=".json" 
                            onChange={handleRestore} 
                            className="hidden" 
                          />
                        </label>
                        <button 
                          onClick={() => setShowRestoreConfirm(false)}
                          className="w-full py-3 text-[10px] font-bold uppercase text-black/40 tracking-widest"
                        >
                          Cancelar
                        </button>
                      </div>
                    </motion.div>
                  </div>
                )}
              </AnimatePresence>

              <div className="bg-white rounded-3xl p-6 shadow-xl border border-black/5 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-black/5 rounded-xl flex items-center justify-center">
                    <Share2 className="w-5 h-5 text-black/40" />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-black">Sobre o App</h3>
                    <p className="text-[10px] text-black/40 uppercase font-bold">Versão 1.0.0 • Delicata</p>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Export Options Modal */}
        <AnimatePresence>
          {showExportOptions && (
            <div className="fixed inset-0 z-[70] flex items-center justify-center px-6">
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setShowExportOptions(false)}
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              />
              <motion.div 
                initial={{ scale: 0.9, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.9, opacity: 0, y: 20 }}
                className="bg-white w-full max-w-sm rounded-3xl p-6 shadow-2xl relative z-10 space-y-6"
              >
                <div className="flex justify-between items-center">
                  <h3 className="font-bold text-[#6B0D0D] uppercase tracking-widest text-xs">Exportar Relatório</h3>
                  <button onClick={() => setShowExportOptions(false)} className="text-black/40">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase font-bold text-black/60 ml-1">Período</label>
                    <div className="grid grid-cols-2 gap-2">
                      {['MENSAL', 'ANUAL'].map((p) => (
                        <button
                          key={p}
                          onClick={() => setExportPeriod(p as any)}
                          className={cn(
                            "py-2 rounded-xl text-[10px] font-bold border transition-all uppercase",
                            exportPeriod === p 
                              ? "bg-[#6B0D0D] border-[#6B0D0D] text-white" 
                              : "bg-white border-black/10 text-black/40"
                          )}
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                  </div>

                  {exportPeriod === 'MENSAL' && (
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold text-black/60 ml-1">Mês</label>
                      <select
                        value={exportMonth}
                        onChange={(e) => setExportMonth(Number(e.target.value))}
                        className="w-full bg-black/5 border border-black/10 rounded-xl py-2 px-3 text-xs focus:ring-2 focus:ring-[#6B0D0D] outline-none text-black"
                      >
                        {Array.from({ length: 12 }).map((_, i) => (
                          <option key={i} value={i}>
                            {format(setMonth(new Date(), i), 'MMMM', { locale: ptBR })}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className="space-y-1">
                    <label className="text-[10px] uppercase font-bold text-black/60 ml-1">Ano</label>
                    <select
                      value={exportYear}
                      onChange={(e) => setExportYear(Number(e.target.value))}
                      className="w-full bg-black/5 border border-black/10 rounded-xl py-2 px-3 text-xs focus:ring-2 focus:ring-[#6B0D0D] outline-none text-black"
                    >
                      {Array.from({ length: 5 }).map((_, i) => {
                        const year = new Date().getFullYear() - i;
                        return <option key={year} value={year}>{year}</option>;
                      })}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] uppercase font-bold text-black/60 ml-1">Formato</label>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { id: 'PDF', icon: <FileText className="w-4 h-4" /> },
                        { id: 'Excel', icon: <FileSpreadsheet className="w-4 h-4" /> }
                      ].map((f) => (
                        <button
                          key={f.id}
                          onClick={() => setExportFormat(f.id as any)}
                          className={cn(
                            "py-3 rounded-xl text-[10px] font-bold border transition-all uppercase flex items-center justify-center gap-2",
                            exportFormat === f.id 
                              ? "bg-[#6B0D0D] border-[#6B0D0D] text-white" 
                              : "bg-white border-black/10 text-black/40"
                          )}
                        >
                          {f.icon}
                          {f.id}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={handlePreviewReport}
                    className="flex-1 bg-black/5 text-black/60 py-4 rounded-2xl font-bold text-xs uppercase border border-black/10 active:scale-95 transition-transform flex items-center justify-center gap-2"
                  >
                    <Eye className="w-4 h-4" />
                    Visualizar
                  </button>
                  <button
                    onClick={handleExport}
                    disabled={isExporting}
                    className="flex-1 bg-[#6B0D0D] text-white py-4 rounded-2xl font-bold text-xs uppercase shadow-lg active:scale-95 transition-transform flex items-center justify-center gap-2 disabled:opacity-50 disabled:scale-100"
                  >
                    {isExporting ? (
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <Download className="w-4 h-4" />
                    )}
                    {isExporting ? 'Exportando...' : 'Exportar'}
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Report Preview Modal */}
        <AnimatePresence>
          {showReportPreview && reportPreviewData && (
            <div className="fixed inset-0 z-[80] flex items-center justify-center px-4">
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setShowReportPreview(false)}
                className="absolute inset-0 bg-black/80 backdrop-blur-md"
              />
              <motion.div 
                initial={{ scale: 0.9, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.9, opacity: 0, y: 20 }}
                className="bg-white w-full max-w-lg h-[80vh] rounded-[32px] shadow-2xl relative z-10 flex flex-col overflow-hidden"
              >
                <div className="p-6 border-b border-black/5 flex justify-between items-center bg-[#6B0D0D] text-white">
                  <div>
                    <h3 className="font-bold uppercase tracking-widest text-xs opacity-70">Visualização do Relatório</h3>
                    <p className="text-lg font-light">{reportPreviewData.period}</p>
                  </div>
                  <button onClick={() => setShowReportPreview(false)} className="p-2 bg-white/10 rounded-full">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="flex-1 overflow-auto p-4">
                  <div className="min-w-[500px]">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-black/5">
                          {reportPreviewData.headers.map((h, i) => (
                            <th key={i} className="p-3 text-[10px] uppercase font-bold text-black/40 border-b border-black/5">
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {reportPreviewData.rows.map((row, i) => (
                          <tr key={i} className="border-b border-black/5 last:border-0">
                            {row.map((cell, j) => (
                              <td key={j} className={cn(
                                "p-3 text-xs text-black",
                                j > 0 ? "text-right font-mono" : "font-bold"
                              )}>
                                {typeof cell === 'number' ? `R$ ${cell.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : cell}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="sticky bottom-0 bg-white shadow-[0_-4px_10px_rgba(0,0,0,0.05)]">
                        <tr className="bg-[#6B0D0D] text-white">
                          <td className="p-3 text-xs font-bold uppercase">Totais</td>
                          <td className="p-3 text-xs text-right font-mono">R$ {reportPreviewData.totals.dinheiro.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                          <td className="p-3 text-xs text-right font-mono">R$ {reportPreviewData.totals.pix.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                          <td className="p-3 text-xs text-right font-mono">R$ {reportPreviewData.totals.debito.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                          <td className="p-3 text-xs text-right font-mono">R$ {reportPreviewData.totals.credito.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                          <td className="p-3 text-xs text-right font-mono font-bold">R$ {reportPreviewData.totals.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>

                <div className="p-6 bg-black/5 border-t border-black/5">
                  <button
                    onClick={() => {
                      setShowReportPreview(false);
                      handleExport();
                    }}
                    className="w-full bg-[#6B0D0D] text-white py-4 rounded-2xl font-bold text-xs uppercase shadow-lg active:scale-95 transition-transform flex items-center justify-center gap-2"
                  >
                    <Download className="w-4 h-4" />
                    Baixar / Compartilhar ({exportFormat})
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Toast Notification */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className={`fixed bottom-24 left-1/2 -translate-x-1/2 z-[100] px-6 py-3 rounded-full shadow-lg flex items-center gap-2 whitespace-nowrap ${
              toast.type === 'success' ? 'bg-green-600 text-white' :
              toast.type === 'error' ? 'bg-red-600 text-white' :
              'bg-[#6B0D0D] text-white'
            }`}
          >
            {toast.type === 'success' && <CheckCircle className="w-5 h-5" />}
            {toast.type === 'error' && <AlertCircle className="w-5 h-5" />}
            {toast.type === 'info' && <Info className="w-5 h-5" />}
            <span className="text-sm font-medium">{toast.message}</span>
          </motion.div>
        )}
      </AnimatePresence>
        <AnimatePresence>
          {showSaleDetail && saleToView && (
            <div className="fixed inset-0 z-[80] flex items-center justify-center px-6">
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setShowSaleDetail(false)}
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              />
              <motion.div 
                initial={{ scale: 0.9, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.9, opacity: 0, y: 20 }}
                className="bg-white w-full max-w-sm rounded-[32px] overflow-hidden shadow-2xl relative z-10 flex flex-col max-h-[85vh]"
              >
                <div className="p-6 bg-[#6B0D0D] text-white flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center">
                      <ShoppingBag className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-bold uppercase tracking-widest text-[10px] opacity-70">Detalhes da Venda</h3>
                      <p className="text-sm font-bold truncate max-w-[180px]">{saleToView.customerName}</p>
                    </div>
                  </div>
                  <button onClick={() => setShowSaleDetail(false)} className="p-2 bg-white/10 rounded-full">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="flex-1 overflow-auto p-6 space-y-6">
                  {/* Info Grid */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-1 text-[10px] font-bold text-black/40 uppercase tracking-wider">
                        <Calendar className="w-3 h-3" />
                        Data
                      </div>
                      <p className="text-xs font-bold text-black">
                        {format(new Date(saleToView.timestamp), 'dd/MM/yyyy')}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-1 text-[10px] font-bold text-black/40 uppercase tracking-wider">
                        <Clock className="w-3 h-3" />
                        Hora
                      </div>
                      <p className="text-xs font-bold text-black">
                        {format(new Date(saleToView.timestamp), 'HH:mm')}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-1 text-[10px] font-bold text-black/40 uppercase tracking-wider">
                        <CreditCard className="w-3 h-3" />
                        Pagamento
                      </div>
                      <p className="text-xs font-bold text-black">
                        {PAYMENT_LABELS[saleToView.paymentType]}
                        {saleToView.installments && saleToView.installments > 1 && ` (${saleToView.installments}x)`}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-1 text-[10px] font-bold text-black/40 uppercase tracking-wider">
                        <DollarSign className="w-3 h-3" />
                        Total
                      </div>
                      <p className="text-lg font-bold text-[#6B0D0D]">
                        R$ {saleToView.totalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </p>
                    </div>
                  </div>

                  {/* Items List */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 pb-2 border-b border-black/5">
                      <Package className="w-4 h-4 text-black/40" />
                      <h4 className="text-[10px] font-bold uppercase tracking-widest text-black/40">Produtos</h4>
                    </div>
                    <div className="space-y-2">
                      {saleToView.items.map((item, idx) => (
                        <div key={idx} className="flex justify-between items-center bg-black/5 p-3 rounded-xl">
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold text-black truncate">{item.product}</p>
                            <p className="text-[10px] text-black/40 font-medium">
                              {item.quantity}x R$ {item.unitPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </p>
                          </div>
                          <div className="text-right ml-2">
                            <p className="text-xs font-bold text-black">
                              R$ {item.subtotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {saleToView.discount && saleToView.discount > 0 && (
                    <div className="flex justify-between items-center bg-green-50 p-3 rounded-xl border border-green-100">
                      <div className="flex items-center gap-2">
                        <Tag className="w-4 h-4 text-green-600" />
                        <span className="text-[10px] font-bold text-green-700 uppercase">Desconto Aplicado</span>
                      </div>
                      <span className="text-xs font-bold text-green-700">- R$ {saleToView.discount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                    </div>
                  )}
                </div>

                <div className="p-6 bg-black/5 border-t border-black/5 flex gap-3">
                  <button
                    onClick={() => {
                      setShowSaleDetail(false);
                      setShowDeleteConfirm(saleToView.id || null);
                    }}
                    className="flex-1 bg-white text-red-600 py-4 rounded-2xl font-bold text-xs uppercase border border-red-100 active:scale-95 transition-transform flex items-center justify-center gap-2"
                  >
                    <Trash2 className="w-4 h-4" />
                    Cancelar Venda
                  </button>
                  <button
                    onClick={() => setShowSaleDetail(false)}
                    className="flex-1 bg-[#6B0D0D] text-white py-4 rounded-2xl font-bold text-xs uppercase shadow-lg active:scale-95 transition-transform"
                  >
                    Fechar
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Google Drive Permission Modal */}
        <AnimatePresence>
          {showGDriveConfirm && (
            <div className="fixed inset-0 z-[80] flex items-center justify-center px-6">
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={() => setShowGDriveConfirm(false)}
              />
              <motion.div 
                initial={{ scale: 0.9, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.9, opacity: 0, y: 20 }}
                className="bg-white w-full max-w-xs rounded-3xl p-6 shadow-2xl relative z-10 space-y-6"
              >
                <div className="text-center space-y-4">
                  <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto">
                    <Share2 className="w-8 h-8 text-blue-600" />
                  </div>
                  <h3 className="font-bold text-black text-lg">Permissão do Google Drive</h3>
                  <p className="text-xs text-black/60 leading-relaxed">
                    O aplicativo solicita permissão para acessar sua conta Google Drive para salvar os arquivos de backup com segurança.
                  </p>
                </div>

                <div className="space-y-3">
                  <button 
                    onClick={() => {
                      setShowGDriveConfirm(false);
                      connectGDrive();
                    }}
                    className="w-full bg-blue-600 text-white py-4 rounded-2xl font-bold text-xs uppercase shadow-lg active:scale-95 transition-transform"
                  >
                    Permitir e Conectar
                  </button>
                  <button 
                    onClick={() => setShowGDriveConfirm(false)}
                    className="w-full py-3 text-[10px] font-bold uppercase text-black/40 tracking-widest"
                  >
                    Cancelar
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Backup Share Menu Modal */}
        <AnimatePresence>
          {showShareMenu && (
            <div className="fixed inset-0 z-[80] flex items-center justify-center px-6">
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={() => setShowShareMenu(false)}
              />
              <motion.div 
                initial={{ scale: 0.9, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.9, opacity: 0, y: 20 }}
                className="bg-white w-full max-w-xs rounded-3xl p-6 shadow-2xl relative z-10 space-y-6"
              >
                <div className="text-center space-y-4">
                  <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto">
                    <Share2 className="w-8 h-8 text-blue-600" />
                  </div>
                  <h3 className="font-bold text-black text-lg">Compartilhar Backup</h3>
                  <p className="text-xs text-black/60 leading-relaxed">
                    Escolha para onde deseja enviar o arquivo de backup do banco de dados.
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-3">
                  <button 
                    onClick={() => {
                      setShowShareMenu(false);
                      handleManualGDriveBackup();
                    }}
                    disabled={isExporting}
                    className="w-full bg-blue-600 text-white py-4 rounded-2xl font-bold text-xs uppercase shadow-lg flex items-center justify-center gap-2 active:scale-95 transition-transform disabled:opacity-50 disabled:scale-100"
                  >
                    <Share2 className="w-4 h-4" />
                    Google Drive
                  </button>
                  
                  <button 
                    onClick={() => handleShareBackup()}
                    disabled={isExporting}
                    className="w-full bg-[#25D366] text-white py-4 rounded-2xl font-bold text-xs uppercase shadow-lg flex items-center justify-center gap-2 active:scale-95 transition-transform disabled:opacity-50 disabled:scale-100"
                  >
                    <MessageCircle className="w-4 h-4" />
                    WhatsApp
                  </button>

                  <button 
                    onClick={() => handleShareBackup()}
                    disabled={isExporting}
                    className="w-full bg-[#EA4335] text-white py-4 rounded-2xl font-bold text-xs uppercase shadow-lg flex items-center justify-center gap-2 active:scale-95 transition-transform disabled:opacity-50 disabled:scale-100"
                  >
                    <Mail className="w-4 h-4" />
                    Gmail
                  </button>

                  <button 
                    onClick={() => handleShareBackup()}
                    disabled={isExporting}
                    className="w-full bg-black/5 text-black/60 py-4 rounded-2xl font-bold text-xs uppercase flex items-center justify-center gap-2 active:scale-95 transition-transform disabled:opacity-50 disabled:scale-100"
                  >
                    <MoreHorizontal className="w-4 h-4" />
                    Outros
                  </button>
                </div>

                <button 
                  onClick={() => setShowShareMenu(false)}
                  className="w-full py-3 text-[10px] font-bold uppercase text-black/40 tracking-widest"
                >
                  Cancelar
                </button>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </main>

      {/* Bottom Navigation (Material 3 Style) */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-lg px-4 pb-[calc(env(safe-area-inset-bottom,1rem)+4px)] pt-3 flex justify-around items-center max-w-md mx-auto z-30 border-t border-black/5 shadow-[0_-4px_20px_rgba(0,0,0,0.03)] rounded-t-[32px]">
        <button 
          onClick={() => setCurrentView('sales')}
          className="relative flex flex-col items-center gap-1 group w-20"
        >
          <div className={cn(
            "px-5 py-1 rounded-full transition-all duration-300 flex items-center justify-center",
            currentView === 'sales' ? "bg-[#6B0D0D] text-white" : "text-black/40 group-active:bg-black/5"
          )}>
            <Plus className="w-5 h-5" />
          </div>
          <span className={cn(
            "text-[10px] font-bold transition-colors",
            currentView === 'sales' ? "text-[#6B0D0D]" : "text-black/40"
          )}>Vendas</span>
        </button>
        <button 
          onClick={() => setCurrentView('reports')}
          className="relative flex flex-col items-center gap-1 group w-20"
        >
          <div className={cn(
            "px-5 py-1 rounded-full transition-all duration-300 flex items-center justify-center",
            currentView === 'reports' ? "bg-[#6B0D0D] text-white" : "text-black/40 group-active:bg-black/5"
          )}>
            <BarChart3 className="w-5 h-5" />
          </div>
          <span className={cn(
            "text-[10px] font-bold transition-colors",
            currentView === 'reports' ? "text-[#6B0D0D]" : "text-black/40"
          )}>Relatórios</span>
        </button>
        <button 
          onClick={() => setCurrentView('settings')}
          className="relative flex flex-col items-center gap-1 group w-20"
        >
          <div className={cn(
            "px-5 py-1 rounded-full transition-all duration-300 flex items-center justify-center",
            currentView === 'settings' ? "bg-[#6B0D0D] text-white" : "text-black/40 group-active:bg-black/5"
          )}>
            <Settings className="w-5 h-5" />
          </div>
          <span className={cn(
            "text-[10px] font-bold transition-colors",
            currentView === 'settings' ? "text-[#6B0D0D]" : "text-black/40"
          )}>Ajustes</span>
        </button>
      </nav>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

const styles = `
  body {
    overscroll-behavior: none;
    background-color: #FDFCFB;
  }
  @keyframes shake {
    0%, 100% { transform: translateX(0); }
    25% { transform: translateX(-4px); }
    75% { transform: translateX(4px); }
  }
  .animate-shake {
    animation: shake 0.2s ease-in-out 0s 2;
  }
`;

if (typeof document !== 'undefined') {
  const styleSheet = document.createElement("style");
  styleSheet.innerText = styles;
  document.head.appendChild(styleSheet);
}
