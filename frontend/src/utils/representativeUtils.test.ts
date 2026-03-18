import { describe, it, expect } from 'vitest'
import { getRepresentativeName } from './representativeUtils'

describe('representativeUtils', () => {
  describe('getRepresentativeName', () => {
    it('should return full name when both firstName and lastName are provided', () => {
      const rep = {
        firstName: 'John',
        lastName: 'Smith',
        email: 'john@example.com',
      }
      
      expect(getRepresentativeName(rep)).toBe('John Smith')
    })

    it('should return firstName only when lastName is missing', () => {
      const rep = {
        firstName: 'John',
        email: 'john@example.com',
      }
      
      expect(getRepresentativeName(rep)).toBe('John')
    })

    it('should return email when firstName and lastName are both missing', () => {
      const rep = {
        email: 'john@example.com',
      }
      
      expect(getRepresentativeName(rep)).toBe('john@example.com')
    })

    it('should return email when firstName is empty string and lastName is missing', () => {
      const rep = {
        firstName: '',
        email: 'John.Smith@company.com',
      }
      
      expect(getRepresentativeName(rep)).toBe('John.Smith@company.com')
    })

    it('should return full name with special characters in names', () => {
      const rep = {
        firstName: 'José',
        lastName: "O'Brien",
        email: 'jose@example.com',
      }
      
      expect(getRepresentativeName(rep)).toBe('José O\'Brien')
    })

    it('should return email when firstName is undefined and lastName is provided', () => {
      const rep = {
        lastName: 'Smith',
        email: 'john@example.com',
      }
      
      expect(getRepresentativeName(rep)).toBe('john@example.com')
    })

    it('should handle empty lastName gracefully', () => {
      const rep = {
        firstName: 'John',
        lastName: '',
        email: 'john@example.com',
      }
      
      expect(getRepresentativeName(rep)).toBe('John')
    })

    it('should return full name with numbers in names', () => {
      const rep = {
        firstName: 'John2',
        lastName: 'Smith3',
        email: 'john@example.com',
      }
      
      expect(getRepresentativeName(rep)).toBe('John2 Smith3')
    })
  })
})
