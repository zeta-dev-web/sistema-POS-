-- Catálogo de demostración para ALMACEN.
-- Precios y existencias son ficticios; no se generan códigos de barras.
-- Se puede volver a ejecutar: actualiza los datos descriptivos y conserva el stock.

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "Tenant" WHERE id = 'tenant_almacen') THEN
    RAISE EXCEPTION 'No existe ALMACEN. Ejecutá primero pnpm db:seed.';
  END IF;
END $$;

INSERT INTO "Product" (
  id, "tenantId", sku, barcode, name, unit, description,
  price, stock, "minStock", active, "updatedAt"
)
VALUES
  -- Lácteos (8)
  ('demo_product_001', 'tenant_almacen', 'LAC-001', NULL, 'Leche entera 1 L', 'UNIT', 'Lácteos', 1800, 12, 3, TRUE, NOW()),
  ('demo_product_002', 'tenant_almacen', 'LAC-002', NULL, 'Leche descremada 1 L', 'UNIT', 'Lácteos', 1900, 10, 3, TRUE, NOW()),
  ('demo_product_003', 'tenant_almacen', 'LAC-003', NULL, 'Yogur firme de frutilla 190 g', 'UNIT', 'Lácteos', 950, 12, 4, TRUE, NOW()),
  ('demo_product_004', 'tenant_almacen', 'LAC-004', NULL, 'Yogur bebible de vainilla 1 L', 'UNIT', 'Lácteos', 2600, 8, 2, TRUE, NOW()),
  ('demo_product_005', 'tenant_almacen', 'LAC-005', NULL, 'Queso cremoso', 'KG', 'Lácteos', 9500, 3.500, 1.000, TRUE, NOW()),
  ('demo_product_006', 'tenant_almacen', 'LAC-006', NULL, 'Queso rallado 40 g', 'UNIT', 'Lácteos', 1350, 8, 2, TRUE, NOW()),
  ('demo_product_007', 'tenant_almacen', 'LAC-007', NULL, 'Manteca 200 g', 'UNIT', 'Lácteos', 2200, 7, 2, TRUE, NOW()),
  ('demo_product_008', 'tenant_almacen', 'LAC-008', NULL, 'Dulce de leche 400 g', 'UNIT', 'Lácteos', 2200, 9, 2, TRUE, NOW()),

  -- Bebidas (10)
  ('demo_product_009', 'tenant_almacen', 'BEB-001', NULL, 'Agua sin gas 1,5 L', 'UNIT', 'Bebidas', 1200, 18, 5, TRUE, NOW()),
  ('demo_product_010', 'tenant_almacen', 'BEB-002', NULL, 'Agua con gas 1,5 L', 'UNIT', 'Bebidas', 1300, 14, 4, TRUE, NOW()),
  ('demo_product_011', 'tenant_almacen', 'BEB-003', NULL, 'Gaseosa cola 2,25 L', 'UNIT', 'Bebidas', 3900, 10, 3, TRUE, NOW()),
  ('demo_product_012', 'tenant_almacen', 'BEB-004', NULL, 'Gaseosa de naranja 2,25 L', 'UNIT', 'Bebidas', 3600, 8, 2, TRUE, NOW()),
  ('demo_product_013', 'tenant_almacen', 'BEB-005', NULL, 'Agua saborizada de limón 1,5 L', 'UNIT', 'Bebidas', 1800, 9, 3, TRUE, NOW()),
  ('demo_product_014', 'tenant_almacen', 'BEB-006', NULL, 'Jugo de naranja 1 L', 'UNIT', 'Bebidas', 2400, 7, 2, TRUE, NOW()),
  ('demo_product_015', 'tenant_almacen', 'BEB-007', NULL, 'Jugo en polvo de naranja 20 g', 'UNIT', 'Bebidas', 600, 20, 5, TRUE, NOW()),
  ('demo_product_016', 'tenant_almacen', 'BEB-008', NULL, 'Cerveza rubia lata 473 ml', 'UNIT', 'Bebidas', 1700, 12, 4, TRUE, NOW()),
  ('demo_product_017', 'tenant_almacen', 'BEB-009', NULL, 'Cerveza rubia 1 L', 'UNIT', 'Bebidas', 3000, 8, 2, TRUE, NOW()),
  ('demo_product_018', 'tenant_almacen', 'BEB-010', NULL, 'Vino tinto 750 ml', 'UNIT', 'Bebidas', 4500, 6, 2, TRUE, NOW()),

  -- Fiambres (7)
  ('demo_product_019', 'tenant_almacen', 'FIA-001', NULL, 'Jamón cocido', 'KG', 'Fiambres', 14000, 2.500, 0.500, TRUE, NOW()),
  ('demo_product_020', 'tenant_almacen', 'FIA-002', NULL, 'Jamón crudo', 'KG', 'Fiambres', 21000, 1.200, 0.300, TRUE, NOW()),
  ('demo_product_021', 'tenant_almacen', 'FIA-003', NULL, 'Queso tybo', 'KG', 'Fiambres', 12000, 2.000, 0.500, TRUE, NOW()),
  ('demo_product_022', 'tenant_almacen', 'FIA-004', NULL, 'Mortadela', 'KG', 'Fiambres', 7500, 2.000, 0.500, TRUE, NOW()),
  ('demo_product_023', 'tenant_almacen', 'FIA-005', NULL, 'Salame tipo milán', 'KG', 'Fiambres', 18000, 1.500, 0.300, TRUE, NOW()),
  ('demo_product_024', 'tenant_almacen', 'FIA-006', NULL, 'Queso pategrás', 'KG', 'Fiambres', 17000, 1.600, 0.400, TRUE, NOW()),
  ('demo_product_025', 'tenant_almacen', 'FIA-007', NULL, 'Panceta ahumada', 'KG', 'Fiambres', 15000, 1.100, 0.300, TRUE, NOW()),

  -- Limpieza (8)
  ('demo_product_026', 'tenant_almacen', 'LIM-001', NULL, 'Lavandina 1 L', 'UNIT', 'Limpieza', 1100, 10, 3, TRUE, NOW()),
  ('demo_product_027', 'tenant_almacen', 'LIM-002', NULL, 'Detergente 750 ml', 'UNIT', 'Limpieza', 1600, 9, 3, TRUE, NOW()),
  ('demo_product_028', 'tenant_almacen', 'LIM-003', NULL, 'Limpiador de pisos 900 ml', 'UNIT', 'Limpieza', 2100, 7, 2, TRUE, NOW()),
  ('demo_product_029', 'tenant_almacen', 'LIM-004', NULL, 'Desengrasante 500 ml', 'UNIT', 'Limpieza', 2400, 6, 2, TRUE, NOW()),
  ('demo_product_030', 'tenant_almacen', 'LIM-005', NULL, 'Jabón en pan 200 g', 'UNIT', 'Limpieza', 800, 12, 4, TRUE, NOW()),
  ('demo_product_031', 'tenant_almacen', 'LIM-006', NULL, 'Esponja multiuso', 'UNIT', 'Limpieza', 900, 10, 3, TRUE, NOW()),
  ('demo_product_032', 'tenant_almacen', 'LIM-007', NULL, 'Bolsas para residuos 45 x 60 cm x 10', 'UNIT', 'Limpieza', 1800, 8, 2, TRUE, NOW()),
  ('demo_product_033', 'tenant_almacen', 'LIM-008', NULL, 'Papel higiénico x 4 rollos', 'UNIT', 'Limpieza', 3000, 7, 2, TRUE, NOW()),

  -- Almacén (10)
  ('demo_product_034', 'tenant_almacen', 'ALM-001', NULL, 'Yerba mate 1 kg', 'UNIT', 'Almacén', 4900, 12, 3, TRUE, NOW()),
  ('demo_product_035', 'tenant_almacen', 'ALM-002', NULL, 'Arroz largo fino 1 kg', 'UNIT', 'Almacén', 1800, 10, 3, TRUE, NOW()),
  ('demo_product_036', 'tenant_almacen', 'ALM-003', NULL, 'Fideos spaghetti 500 g', 'UNIT', 'Almacén', 1300, 14, 4, TRUE, NOW()),
  ('demo_product_037', 'tenant_almacen', 'ALM-004', NULL, 'Harina 000 1 kg', 'UNIT', 'Almacén', 1100, 12, 3, TRUE, NOW()),
  ('demo_product_038', 'tenant_almacen', 'ALM-005', NULL, 'Azúcar 1 kg', 'UNIT', 'Almacén', 1400, 10, 3, TRUE, NOW()),
  ('demo_product_039', 'tenant_almacen', 'ALM-006', NULL, 'Aceite de girasol 900 ml', 'UNIT', 'Almacén', 2800, 8, 2, TRUE, NOW()),
  ('demo_product_040', 'tenant_almacen', 'ALM-007', NULL, 'Puré de tomate 520 g', 'UNIT', 'Almacén', 1000, 12, 3, TRUE, NOW()),
  ('demo_product_041', 'tenant_almacen', 'ALM-008', NULL, 'Sal fina 500 g', 'UNIT', 'Almacén', 800, 10, 3, TRUE, NOW()),
  ('demo_product_042', 'tenant_almacen', 'ALM-009', NULL, 'Lentejas 400 g', 'UNIT', 'Almacén', 2000, 7, 2, TRUE, NOW()),
  ('demo_product_043', 'tenant_almacen', 'ALM-010', NULL, 'Atún al natural 170 g', 'UNIT', 'Almacén', 2800, 6, 2, TRUE, NOW()),

  -- Panificados y golosinas (7)
  ('demo_product_044', 'tenant_almacen', 'PAN-001', NULL, 'Pan francés', 'KG', 'Panificados', 4000, 4.500, 1.000, TRUE, NOW()),
  ('demo_product_045', 'tenant_almacen', 'PAN-002', NULL, 'Pan lactal 600 g', 'UNIT', 'Panificados', 2300, 6, 2, TRUE, NOW()),
  ('demo_product_046', 'tenant_almacen', 'PAN-003', NULL, 'Galletitas de agua 303 g', 'UNIT', 'Galletitas', 1500, 10, 3, TRUE, NOW()),
  ('demo_product_047', 'tenant_almacen', 'PAN-004', NULL, 'Galletitas con chips 118 g', 'UNIT', 'Galletitas', 1600, 9, 3, TRUE, NOW()),
  ('demo_product_048', 'tenant_almacen', 'GOL-001', NULL, 'Alfajor de chocolate', 'UNIT', 'Golosinas', 800, 18, 5, TRUE, NOW()),
  ('demo_product_049', 'tenant_almacen', 'GOL-002', NULL, 'Papas fritas 95 g', 'UNIT', 'Snacks', 2000, 8, 2, TRUE, NOW()),
  ('demo_product_050', 'tenant_almacen', 'GOL-003', NULL, 'Chocolate 100 g', 'UNIT', 'Golosinas', 2200, 7, 2, TRUE, NOW())
ON CONFLICT (id) DO UPDATE SET
  sku = EXCLUDED.sku,
  name = EXCLUDED.name,
  unit = EXCLUDED.unit,
  description = EXCLUDED.description,
  price = EXCLUDED.price,
  active = TRUE,
  "updatedAt" = NOW();

COMMIT;
