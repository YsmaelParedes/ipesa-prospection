import { create } from 'zustand'

interface Contact {
  id?: string
  name: string
  phone: string
  company: string
  address: string
  segment: string
  prospect_status: string
  follow_up_date?: string
}

interface Template {
  id?: string
  name: string
  content: string
  variables: string[]
}

interface Store {
  contacts: Contact[]
  templates: Template[]
  setContacts: (contacts: Contact[]) => void
  setTemplates: (templates: Template[]) => void
  addContact: (contact: Contact) => void
  updateContact: (id: string, contact: Partial<Contact>) => void
  deleteContact: (id: string) => void
  filterBySegment: (segment: string) => Contact[]
}

export const useStore = create<Store>((set, get) => ({
  contacts: [],
  templates: [],

  setContacts: (contacts) => set({ contacts }),
  setTemplates: (templates) => set({ templates }),

  addContact: (contact) => set(state => ({
    contacts: [...state.contacts, { ...contact, id: Date.now().toString() }]
  })),

  updateContact: (id, contact) => set(state => ({
    contacts: state.contacts.map(c => c.id === id ? { ...c, ...contact } : c)
  })),

  deleteContact: (id) => set(state => ({
    contacts: state.contacts.filter(c => c.id !== id)
  })),

  filterBySegment: (segment) => {
    return get().contacts.filter(c => c.segment === segment)
  }
}))
