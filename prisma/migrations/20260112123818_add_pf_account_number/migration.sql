-- CreateEnum
CREATE TYPE "Form16Status" AS ENUM ('PENDING', 'GENERATED', 'AVAILABLE');

-- CreateEnum
CREATE TYPE "InvestmentDeclarationStatus" AS ENUM ('PENDING', 'SUBMITTED', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "TaxDocumentStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED');

-- AlterTable
ALTER TABLE "employee_masters" ADD COLUMN     "pfAccountNumber" TEXT;

-- CreateTable
CREATE TABLE "form16" (
    "id" TEXT NOT NULL,
    "employeeMasterId" TEXT NOT NULL,
    "financialYear" TEXT NOT NULL,
    "partA" BOOLEAN NOT NULL DEFAULT false,
    "partB" BOOLEAN NOT NULL DEFAULT false,
    "generatedDate" TIMESTAMP(3),
    "downloadUrl" TEXT,
    "fileName" TEXT,
    "status" "Form16Status" NOT NULL DEFAULT 'PENDING',
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "form16_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "investment_declarations" (
    "id" TEXT NOT NULL,
    "employeeMasterId" TEXT NOT NULL,
    "financialYear" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "particulars" TEXT NOT NULL,
    "declaredAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "proofSubmitted" BOOLEAN NOT NULL DEFAULT false,
    "verifiedAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" "InvestmentDeclarationStatus" NOT NULL DEFAULT 'PENDING',
    "proofDocumentUrl" TEXT,
    "verifiedBy" TEXT,
    "verifiedDate" TIMESTAMP(3),
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "investment_declarations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tax_documents" (
    "id" TEXT NOT NULL,
    "employeeMasterId" TEXT NOT NULL,
    "documentType" TEXT NOT NULL,
    "documentName" TEXT NOT NULL,
    "financialYear" TEXT NOT NULL,
    "fileUrl" TEXT,
    "uploadDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "TaxDocumentStatus" NOT NULL DEFAULT 'PENDING',
    "verifiedBy" TEXT,
    "verifiedDate" TIMESTAMP(3),
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tax_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "form16_employeeMasterId_financialYear_key" ON "form16"("employeeMasterId", "financialYear");

-- AddForeignKey
ALTER TABLE "form16" ADD CONSTRAINT "form16_employeeMasterId_fkey" FOREIGN KEY ("employeeMasterId") REFERENCES "employee_masters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investment_declarations" ADD CONSTRAINT "investment_declarations_employeeMasterId_fkey" FOREIGN KEY ("employeeMasterId") REFERENCES "employee_masters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_documents" ADD CONSTRAINT "tax_documents_employeeMasterId_fkey" FOREIGN KEY ("employeeMasterId") REFERENCES "employee_masters"("id") ON DELETE CASCADE ON UPDATE CASCADE;
