"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

interface LandlordSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  objectId: string;
  objectName: string;
  objectStreet: string | null;
  objectCity: string | null;
  landlordName: string | null;
  landlordAddress: string | null;
  landlordCity: string | null;
  landlordPhone: string | null;
  landlordEmail: string | null;
}

export default function LandlordSettingsModal({
  isOpen, onClose, onSaved, objectId, objectName,
  objectStreet, objectCity,
  landlordName, landlordAddress, landlordCity, landlordPhone, landlordEmail,
}: LandlordSettingsModalProps) {
  const [objStreet, setObjStreet] = useState("");
  const [objCity, setObjCity] = useState("");
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setObjStreet(objectStreet || "");
      setObjCity(objectCity || "");
      setName(landlordName || "");
      setAddress(landlordAddress || "");
      setCity(landlordCity || "");
      setPhone(landlordPhone || "");
      setEmail(landlordEmail || "");
    }
  }, [isOpen, objectStreet, objectCity, landlordName, landlordAddress, landlordCity, landlordPhone, landlordEmail]);

  if (!isOpen) return null;

  const handleSave = async () => {
    setSaving(true);
    const { error } = await supabase
      .from("objects")
      .update({
        object_street: objStreet.trim() || null,
        object_city: objCity.trim() || null,
        landlord_name: name.trim() || null,
        landlord_address: address.trim() || null,
        landlord_city: city.trim() || null,
        landlord_phone: phone.trim() || null,
        landlord_email: email.trim() || null,
      })
      .eq("id", objectId);

    if (error) {
      alert("Fehler beim Speichern: " + error.message);
    } else {
      onSaved();
      onClose();
    }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="p-5 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">Einstellungen</h2>
          <p className="text-sm text-gray-500 mt-0.5">{objectName}</p>
        </div>

        <div className="p-5 space-y-6">
          {/* Objektadresse */}
          <div>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Objektadresse</h3>
            <p className="text-[11px] text-gray-400 mb-3">Standard-Adresse für Mieter ohne eigene Kontaktdaten.</p>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Straße + Hausnummer</label>
                <input type="text" value={objStreet} onChange={(e) => setObjStreet(e.target.value)}
                  placeholder="z.B. Frankfurter Allee 285"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">PLZ + Ort</label>
                <input type="text" value={objCity} onChange={(e) => setObjCity(e.target.value)}
                  placeholder="z.B. 10247 Berlin"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
              </div>
            </div>
          </div>

          <div className="border-t border-gray-200" />

          {/* Vermieter */}
          <div>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Vermieter / Absender</h3>
            <p className="text-[11px] text-gray-400 mb-3">Absender auf Mahnschreiben.</p>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Name / Firma</label>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)}
                  placeholder="z.B. Sisyphos Investment GmbH"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Straße + Hausnummer</label>
                <input type="text" value={address} onChange={(e) => setAddress(e.target.value)}
                  placeholder="z.B. Husemannstr. 7"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">PLZ + Ort</label>
                <input type="text" value={city} onChange={(e) => setCity(e.target.value)}
                  placeholder="z.B. 10435 Berlin"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Telefon</label>
                  <input type="text" value={phone} onChange={(e) => setPhone(e.target.value)}
                    placeholder="Optional"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">E-Mail</label>
                  <input type="text" value={email} onChange={(e) => setEmail(e.target.value)}
                    placeholder="Optional"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="p-5 border-t border-gray-100 flex gap-3 justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">Abbrechen</button>
          <button onClick={handleSave} disabled={saving} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50">
            {saving ? "Speichern..." : "Speichern"}
          </button>
        </div>
      </div>
    </div>
  );
}
