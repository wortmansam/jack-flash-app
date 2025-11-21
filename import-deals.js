require('dotenv').config(); // Load .env file

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Initialize Supabase client
const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseKey = process.env.REACT_APP_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Helper function to parse CSV
function parseCSV(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.trim().split('\n');
  const headers = lines[0].split(',').map(h => h.trim());
  
  return lines.slice(1).map(line => {
    const values = line.split(',').map(v => v.trim());
    const obj = {};
    headers.forEach((header, index) => {
      obj[header] = values[index];
    });
    return obj;
  });
}

// Helper function to convert date format YYYYMMDD to YYYY-MM-DD
function formatDate(dateStr) {
  if (dateStr.length !== 8) return null;
  const year = dateStr.substring(0, 4);
  const month = dateStr.substring(4, 6);
  const day = dateStr.substring(6, 8);
  return `${year}-${month}-${day}`;
}

async function importComboMaster() {
  console.log('Importing/Updating combo_master...');
  const data = parseCSV('./ComboMaster.csv');
  
  const records = data.map(row => ({
    store_number: parseInt(row['Store #']),
    combo_number: parseInt(row['Combo #']),
    description: row['Description'],
    start_date: formatDate(row['Start Date']),
    start_time: parseInt(row['Start Time']),
    end_date: formatDate(row['End Date']),
    end_time: parseInt(row['End Time']),
    combo_price: parseFloat(row['Combo Price']) || 0,
    updated_at: new Date().toISOString()
  }));
  
  // UPSERT: Insert new records or update existing based on store_number + combo_number
  const { data: inserted, error } = await supabase
    .from('combo_master')
    .upsert(records, {
      onConflict: 'store_number,combo_number', // unique constraint
      ignoreDuplicates: false // update if exists
    });
  
  if (error) {
    console.error('Error importing combo_master:', error);
  } else {
    console.log(`✓ Upserted ${records.length} combo_master records`);
  }
}

async function importComboDetail() {
  console.log('Importing/Updating combo_detail...');
  const data = parseCSV('./ComboDetail.csv');
  
  // First, we need to delete old combo_detail records and insert fresh
  // (since combo_detail doesn't have a natural unique key beyond the data itself)
  const storeNumbers = [...new Set(data.map(row => parseInt(row['Store#'])))];
  const comboNumbers = [...new Set(data.map(row => parseInt(row['Combo #'])))];
  
  console.log('  Clearing old combo_detail records...');
  for (const storeNum of storeNumbers) {
    for (const comboNum of comboNumbers) {
      await supabase
        .from('combo_detail')
        .delete()
        .eq('store_number', storeNum)
        .eq('combo_number', comboNum);
    }
  }
  
  const records = data.map(row => ({
    store_number: parseInt(row['Store#']),
    combo_number: parseInt(row['Combo #']),
    sequence: parseInt(row['Sequence']),
    type: row['Type'],
    plu_number: parseInt(row['PLU #']) || null,
    modifier: parseInt(row['Modifier']) || 0,
    price: (parseFloat(row['Price']) || 0) / 100, // Convert cents to dollars
    mix_number: parseInt(row['Mix #']) || null,
    quantity: parseInt(row['Qty']),
    percentage: (parseFloat(row['Percentage']) || 0) / 100, // Convert to decimal (e.g., 20 -> 0.20)
    discount_amount: (parseFloat(row['Discount Amount']) || 0) / 100, // Convert cents to dollars
    transaction_limit: parseInt(row['Transaction Limit']) || 5,
    updated_at: new Date().toISOString()
  }));
  
  const { data: inserted, error } = await supabase
    .from('combo_detail')
    .insert(records);
  
  if (error) {
    console.error('Error importing combo_detail:', error);
  } else {
    console.log(`✓ Inserted ${records.length} combo_detail records`);
  }
}

async function importMixMaster() {
  console.log('Importing/Updating mix_master...');
  const data = parseCSV('./MixMaster.csv');
  
  const records = data.map(row => ({
    store_number: parseInt(row['Store #']),
    mix_number: parseInt(row['Mix #']),
    description: row['Description'],
    updated_at: new Date().toISOString()
  }));
  
  // UPSERT: Insert new or update existing based on store_number + mix_number
  const { data: inserted, error } = await supabase
    .from('mix_master')
    .upsert(records, {
      onConflict: 'store_number,mix_number',
      ignoreDuplicates: false
    });
  
  if (error) {
    console.error('Error importing mix_master:', error);
  } else {
    console.log(`✓ Upserted ${records.length} mix_master records`);
  }
}

async function importMixDetail() {
  console.log('Importing/Updating mix_detail...');
  const data = parseCSV('./MixDetail.csv');
  
  // Clear old mix_detail records for these store/mix combinations, then insert fresh
  const uniqueCombos = [...new Set(data.map(row => `${row['Store #']}-${row['Mix #']}`))];
  
  console.log('  Clearing old mix_detail records...');
  for (const combo of uniqueCombos) {
    const [storeNum, mixNum] = combo.split('-').map(n => parseInt(n));
    await supabase
      .from('mix_detail')
      .delete()
      .eq('store_number', storeNum)
      .eq('mix_number', mixNum);
  }
  
  const records = data.map(row => ({
    store_number: parseInt(row['Store #']),
    mix_number: parseInt(row['Mix #']),
    plu: parseInt(row['PLU']),
    updated_at: new Date().toISOString()
  }));
  
  const { data: inserted, error } = await supabase
    .from('mix_detail')
    .insert(records);
  
  if (error) {
    console.error('Error importing mix_detail:', error);
  } else {
    console.log(`✓ Inserted ${records.length} mix_detail records`);
  }
}

async function runImport() {
  console.log('═══════════════════════════════════════════════');
  console.log('  JACK FLASH DEALS IMPORT/UPDATE SCRIPT');
  console.log('═══════════════════════════════════════════════\n');
  
  try {
    // Import in correct order (respecting foreign keys)
    await importComboMaster();
    await importComboDetail();
    await importMixMaster();
    await importMixDetail();
    
    console.log('\n═══════════════════════════════════════════════');
    console.log('  ✓ ALL IMPORTS COMPLETED SUCCESSFULLY!');
    console.log('═══════════════════════════════════════════════\n');
  } catch (error) {
    console.error('\n✗ Import failed:', error);
    console.error('\nPlease check:');
    console.error('  1. CSV files are in the correct directory');
    console.error('  2. Supabase credentials are correct in .env');
    console.error('  3. Tables exist in Supabase');
  }
}

// Run the import
runImport();